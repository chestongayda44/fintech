package com.fintechco.loans;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class CreditDecision {
    private static final String BUREAU_URL = "https://bureau.partner.example/v2/score/";
    private static final int DEFAULT_SCORE = 680;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    int creditScore(String applicantId) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(BUREAU_URL + applicantId))
                    .timeout(Duration.ofSeconds(5)).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            return Integer.parseInt(res.body().trim());
        } catch (Exception e) {
            return DEFAULT_SCORE;
        }
    }

    public boolean approve(String applicantId, long amountCents) {
        int score = creditScore(applicantId);
        return score >= 660 && amountCents <= 2_500_000;
    }
}
