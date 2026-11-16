package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

var client = &http.Client{Timeout: 5 * time.Second}

func post(ctx context.Context, batchID string) error {
	url := os.Getenv("LEDGER_URL") + "/batches/" + batchID
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("LEDGER_TOKEN"))
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("posting batch %s: %w", batchID, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("posting batch %s: HTTP %d", batchID, resp.StatusCode)
	}
	return nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := post(ctx, os.Args[1]); err != nil {
		log.Printf("ledger sync failed: %v", err)
		os.Exit(1)
	}
}
