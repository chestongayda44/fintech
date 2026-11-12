package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
)

type Payment struct {
	CardNumber  string `json:"card_number"`
	ExpiryMonth int    `json:"expiry_month"`
	ExpiryYear  int    `json:"expiry_year"`
	AmountCents int64  `json:"amount_cents"`
	MerchantID  string `json:"merchant_id"`
}

const processorURL = "https://processor.internal.fintechco.example/v2/authorize"

func authorize(w http.ResponseWriter, r *http.Request) {
	var p Payment
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	body, _ := json.Marshal(p)
	resp, err := http.Post(processorURL, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("authorize failed for card %s merchant %s: %v", p.CardNumber, p.MerchantID, err)
		http.Error(w, "processor unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.WriteHeader(resp.StatusCode)
}

func main() {
	http.HandleFunc("/authorize", authorize)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
