package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 3 * time.Second}

const acsURL = "https://acs.internal.fintechco.example/challenge"

func mask(pan string) string {
	if len(pan) < 4 {
		return "****"
	}
	return "**** " + pan[len(pan)-4:]
}

func verify(ctx context.Context, pan, challengeID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, acsURL+"?id="+challengeID, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("3DS verification unavailable for card %s: %v", mask(pan), err)
		return errors.New("verification unavailable: decline")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return errors.New("challenge failed")
	}
	return nil
}

func main() {
	http.HandleFunc("/verify", func(w http.ResponseWriter, r *http.Request) {
		if err := verify(r.Context(), r.URL.Query().Get("pan"), r.URL.Query().Get("id")); err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	log.Fatal(http.ListenAndServe(":8081", nil))
}
