// Command freshness checks that the published stress payload is current, and pages if it isn't.
//
//	go run ./ops/freshness                 # reads from GCS when DATA_SOURCE=gcs, else data/published/
//	go run ./ops/freshness -payload path   # check a specific file
//
// Exit status: 0 healthy, 2 stale (page), 1 couldn't check.
//
// "Current" means: the payload's last observation is the latest quarter FRED should have published
// (quarterly bank data lands about 75 days after quarter end), and the pipeline published within
// the last 48 hours.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	releaseLag  = 75 * 24 * time.Hour // FRED quarterly bank data: ~75 days after quarter end
	maxAge      = 48 * time.Hour      // nightly job; two missed runs is a page
	runbookLink = "ops/RUNBOOK.md#freshness-alert"
)

type payload struct {
	GeneratedAt  string `json:"generated_at"`
	DataSource   string `json:"data_source"` // "live" or "seed", when the pipeline records it
	LastObserved struct {
		Date string `json:"date"`
	} `json:"last_observed"`
}

type finding struct {
	Name, Detail string
}

// quarter is a calendar quarter, e.g. {2026, 2}.
type quarter struct{ Year, Q int }

func (q quarter) String() string { return fmt.Sprintf("%d Q%d", q.Year, q.Q) }
func (q quarter) index() int     { return q.Year*4 + q.Q - 1 }
func (q quarter) end() time.Time {
	start := time.Date(q.Year, time.Month((q.Q-1)*3+1), 1, 0, 0, 0, 0, time.UTC)
	return start.AddDate(0, 3, 0).Add(-time.Nanosecond)
}

func quarterOf(t time.Time) quarter { return quarter{t.Year(), (int(t.Month())-1)/3 + 1} }

func prev(q quarter) quarter {
	if q.Q == 1 {
		return quarter{q.Year - 1, 4}
	}
	return quarter{q.Year, q.Q - 1}
}

// expectedLatest is the most recent quarter whose data FRED should have published by now.
func expectedLatest(now time.Time) quarter {
	q := quarterOf(now)
	for q.end().Add(releaseLag).After(now) {
		q = prev(q)
	}
	return q
}

// check returns the reasons to page (empty when healthy).
func check(p payload, now time.Time) ([]finding, error) {
	obs, err := time.Parse("2006-01-02", p.LastObserved.Date)
	if err != nil {
		return nil, fmt.Errorf("payload has no valid last_observed.date: %w", err)
	}
	gen, err := time.Parse(time.RFC3339, p.GeneratedAt)
	if err != nil {
		return nil, fmt.Errorf("payload has no valid generated_at: %w", err)
	}
	var out []finding
	have, want := quarterOf(obs), expectedLatest(now)
	if have.index() < want.index() {
		out = append(out, finding{"data-behind", fmt.Sprintf(
			"data runs through %s, but FRED has published through %s (%d quarter(s) behind)",
			have, want, want.index()-have.index())})
	}
	if age := now.Sub(gen); age > maxAge {
		out = append(out, finding{"not-published", fmt.Sprintf(
			"last published %s ago; the nightly job should publish daily", age.Round(time.Hour))})
	}
	if p.DataSource == "seed" {
		out = append(out, finding{"seed-data", "payload was built from cached seed data, not the live FRED API"})
	}
	return out, nil
}

func load(path string) ([]byte, string, error) {
	if path == "" && strings.EqualFold(os.Getenv("DATA_SOURCE"), "gcs") && os.Getenv("GCS_BUCKET") != "" {
		prefix := strings.Trim(os.Getenv("GCS_PREFIX"), "/")
		if prefix == "" {
			prefix = "macro-credit-risk"
		}
		uri := fmt.Sprintf("gs://%s/%s/stress_payload.json", os.Getenv("GCS_BUCKET"), prefix)
		b, err := exec.Command("gcloud", "storage", "cat", uri).Output()
		return b, uri, err
	}
	if path == "" {
		path = "data/published/stress_payload.json"
	}
	b, err := os.ReadFile(path)
	return b, path, err
}

func main() {
	path := flag.String("payload", "", "payload file (default: GCS when DATA_SOURCE=gcs, else data/published/)")
	nowFlag := flag.String("now", "", "evaluate as of this RFC3339 time (testing)")
	flag.Parse()

	now := time.Now().UTC()
	if *nowFlag != "" {
		t, err := time.Parse(time.RFC3339, *nowFlag)
		if err != nil {
			fmt.Fprintln(os.Stderr, "bad -now:", err)
			os.Exit(1)
		}
		now = t
	}

	raw, src, err := load(*path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "freshness: couldn't read %s: %v\n", src, err)
		os.Exit(1)
	}
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		fmt.Fprintf(os.Stderr, "freshness: %s is not valid JSON: %v\n", src, err)
		os.Exit(1)
	}
	findings, err := check(p, now)
	if err != nil {
		fmt.Fprintln(os.Stderr, "freshness:", err)
		os.Exit(1)
	}

	gen, _ := time.Parse(time.RFC3339, p.GeneratedAt)
	obs, _ := time.Parse("2006-01-02", p.LastObserved.Date)
	ago := now.Sub(gen).Round(time.Minute)
	if ago < 0 {
		ago = 0
	}
	if len(findings) == 0 {
		fmt.Printf("OK    stress-payload-fresh  data through %s, published %s ago (%s)\n",
			quarterOf(obs), ago, src)
		return
	}

	red, reset := "", ""
	if fi, _ := os.Stdout.Stat(); fi != nil && fi.Mode()&os.ModeCharDevice != 0 {
		red, reset = "\033[1;31m", "\033[0m"
	}
	fmt.Printf("%sPAGE  stress-payload-stale  severity=critical%s\n", red, reset)
	fmt.Printf("  checked:      %s\n", now.Format("2006-01-02 15:04 MST"))
	fmt.Printf("  source:       %s\n", src)
	fmt.Printf("  published:    %s (%s ago)\n", gen.Format("2006-01-02 15:04 MST"), ago)
	fmt.Printf("  data through: %s\n", quarterOf(obs))
	for _, f := range findings {
		fmt.Printf("  [%s] %s\n", f.Name, f.Detail)
	}
	fmt.Println("  impact:       the stress-test dashboard is showing out-of-date losses to Risk leadership")
	fmt.Printf("  runbook:      %s\n", runbookLink)
	os.Exit(2)
}
