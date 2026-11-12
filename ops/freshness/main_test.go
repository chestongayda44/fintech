package main

import (
	"testing"
	"time"
)

func at(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestExpectedLatestAccountsForReleaseLag(t *testing.T) {
	cases := map[string]string{
		"2026-11-11T00:00:00Z": "2026 Q2", // Q3 ended Sep 30; not released until mid-December
		"2026-12-20T00:00:00Z": "2026 Q3",
		"2027-02-01T00:00:00Z": "2026 Q3",
		"2027-03-20T00:00:00Z": "2026 Q4",
	}
	for now, want := range cases {
		if got := expectedLatest(at(now)).String(); got != want {
			t.Errorf("expectedLatest(%s) = %s, want %s", now, got, want)
		}
	}
}

func payloadAt(observed, generated string, source string) payload {
	var p payload
	p.LastObserved.Date = observed
	p.GeneratedAt = generated
	p.DataSource = source
	return p
}

func TestHealthyPayloadHasNoFindings(t *testing.T) {
	f, err := check(payloadAt("2026-04-01", "2026-11-11T02:00:00Z", ""), at("2026-11-11T09:00:00Z"))
	if err != nil || len(f) != 0 {
		t.Fatalf("want healthy, got %v %v", f, err)
	}
}

func TestFreshlyPublishedButOldDataPages(t *testing.T) {
	// The job ran an hour ago, but the data stops at 2025 Q4: exactly the silent-staleness case.
	f, _ := check(payloadAt("2025-10-01", "2026-11-11T08:00:00Z", ""), at("2026-11-11T09:00:00Z"))
	if len(f) != 1 || f[0].Name != "data-behind" {
		t.Fatalf("want one data-behind finding, got %v", f)
	}
}

func TestMissedRunsPage(t *testing.T) {
	f, _ := check(payloadAt("2026-04-01", "2026-11-08T02:00:00Z", ""), at("2026-11-11T09:00:00Z"))
	if len(f) != 1 || f[0].Name != "not-published" {
		t.Fatalf("want not-published, got %v", f)
	}
}

func TestSeedSourcedPayloadPages(t *testing.T) {
	f, _ := check(payloadAt("2026-04-01", "2026-11-11T08:00:00Z", "seed"), at("2026-11-11T09:00:00Z"))
	if len(f) != 1 || f[0].Name != "seed-data" {
		t.Fatalf("want seed-data, got %v", f)
	}
}

func TestBadPayloadIsAnError(t *testing.T) {
	if _, err := check(payloadAt("", "2026-11-11T08:00:00Z", ""), at("2026-11-11T09:00:00Z")); err == nil {
		t.Fatal("want error for missing last_observed")
	}
}
