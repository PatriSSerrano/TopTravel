"""Activa los avisos por correo: pide la contraseña de aplicación, la prueba y la guarda en .env."""
import getpass
import pathlib
import re
import smtplib
import ssl
from email.message import EmailMessage

ACCOUNT = "toptravelwebsite@gmail.com"
SITE = "https://toptravel.alwaysdata.net"
ENV = pathlib.Path(__file__).resolve().parent.parent / ".env"
CODE_LENGTH = 16


def test_message():
    message = EmailMessage()
    message["Subject"] = "TopTravel: prueba de avisos por correo"
    message["From"] = f"TopTravel <{ACCOUNT}>"
    message["To"] = ACCOUNT
    message.set_content("Si este correo ha llegado, los avisos por correo de TopTravel funcionan.")
    return message


def try_port(port, password):
    """Devuelve None si el correo sale; si no, el paso que ha fallado y el motivo."""
    step = "conectar"
    try:
        context = ssl.create_default_context()
        if port == 465:
            smtp = smtplib.SMTP_SSL("smtp.gmail.com", port, timeout=30, context=context)
        else:
            smtp = smtplib.SMTP("smtp.gmail.com", port, timeout=30)
        with smtp:
            if port != 465:
                step = "cifrar la conexión"
                smtp.starttls(context=context)
            step = "iniciar sesión"
            smtp.login(ACCOUNT, password)
            step = "enviar el correo de prueba"
            smtp.send_message(test_message())
    except smtplib.SMTPAuthenticationError as error:
        return f"Gmail ha rechazado el código ({error.smtp_code})"
    except (smtplib.SMTPException, OSError) as error:
        return f"fallo al {step} ({type(error).__name__})"
    return None


def main():
    typed = getpass.getpass("Pega la contraseña de aplicación (no se verá al pegarla) y pulsa Enter: ")
    # Google la muestra en grupos con espacios, y al pegar pueden colarse caracteres invisibles.
    password = re.sub(r"[^a-zA-Z]", "", typed).lower()
    if len(password) != CODE_LENGTH:
        print(f"Se han recibido {len(password)} letras y deben ser {CODE_LENGTH}. No se ha cambiado nada.")
        print("Prueba a pegarlo con clic derecho, o escríbelo a mano.")
        return

    problem = None
    for port in (587, 465):
        problem = try_port(port, password)
        if problem is None:
            break
        print(f"Puerto {port}: {problem}.")
    if problem is not None:
        print("No se ha cambiado nada.")
        return

    values = {
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": str(port),
        "SMTP_USER": ACCOUNT,
        "SMTP_PASSWORD": password,
        "MAIL_FROM": ACCOUNT,
        "SITE_URL": SITE,
    }
    lines = [line for line in ENV.read_text(encoding="utf-8-sig").splitlines() if line.partition("=")[0].strip() not in values]
    lines += [f"{key}={value}" for key, value in values.items()]
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Correo de prueba enviado y datos guardados en .env. Avisa en el chat para subirlos a la web.")


if __name__ == "__main__":
    main()
