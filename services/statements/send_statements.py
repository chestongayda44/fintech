import smtplib
from email.message import EmailMessage

SMTP_HOST = "smtp.internal.fintechco.example"
SMTP_USER = "statements-bot"
SMTP_PASSWORD = "Statements-Prod-2026!"


def send(to_addr: str, pdf_bytes: bytes, period: str) -> None:
    msg = EmailMessage()
    msg["From"] = "statements@fintechco.example"
    msg["To"] = to_addr
    msg["Subject"] = f"Your FinTechCo statement for {period}"
    msg.set_content("Your statement is attached.")
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=f"statement-{period}.pdf")
    with smtplib.SMTP(SMTP_HOST, 587, timeout=30) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.send_message(msg)
