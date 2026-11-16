import argparse
import csv
import os
import sys

import psycopg2


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True)
    args = p.parse_args()
    conn = psycopg2.connect(os.environ["WAREHOUSE_DSN"], connect_timeout=10)
    with conn, conn.cursor() as cur:
        cur.execute(
            "SELECT txn_id, account_id, amount_cents, merchant_id FROM transactions WHERE posted_date = %s",
            (args.date,),
        )
        w = csv.writer(sys.stdout)
        w.writerow(["txn_id", "account_id", "amount_cents", "merchant_id"])
        w.writerows(cur.fetchall())
    return 0


if __name__ == "__main__":
    sys.exit(main())
