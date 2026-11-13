package com.fintechco.accounts;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

public class AccountRepository {
    private final DataSource dataSource;

    public AccountRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public long balanceCents(String accountId) throws SQLException {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT balance_cents FROM accounts WHERE id = ?")) {
            ps.setQueryTimeout(5);
            ps.setString(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new SQLException("account not found: " + accountId);
                }
                return rs.getLong(1);
            }
        }
    }
}
