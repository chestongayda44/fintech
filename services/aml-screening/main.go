package main

import (
	"bufio"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const sanctionsURL = "https://sanctions-feed.internal.fintechco.example/sdn.txt"
const cachedList = "/var/lib/aml/sdn-cache.txt"

var client = &http.Client{Timeout: 10 * time.Second}

// loadSanctions returns the current sanctions list. If the feed is unreachable it uses the
// cached copy so screening keeps working.
func loadSanctions() map[string]bool {
	names := map[string]bool{}
	resp, err := client.Get(sanctionsURL)
	var scanner *bufio.Scanner
	if err != nil || resp.StatusCode != http.StatusOK {
		f, ferr := os.Open(cachedList)
		if ferr != nil {
			return names
		}
		defer f.Close()
		scanner = bufio.NewScanner(f)
	} else {
		defer resp.Body.Close()
		scanner = bufio.NewScanner(resp.Body)
	}
	for scanner.Scan() {
		names[strings.ToLower(strings.TrimSpace(scanner.Text()))] = true
	}
	return names
}

func main() {
	list := loadSanctions()
	http.HandleFunc("/screen", func(w http.ResponseWriter, r *http.Request) {
		if list[strings.ToLower(r.URL.Query().Get("name"))] {
			http.Error(w, "match", http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	go func() {
		for range time.Tick(time.Hour) {
			list = loadSanctions()
		}
	}()
	log.Fatal(http.ListenAndServe(":8082", nil))
}
