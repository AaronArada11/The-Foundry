from __future__ import annotations

import httpx


class VerificationError(ValueError):
    pass


async def verify_turnstile(
    token: str | None,
    *,
    remote_ip: str,
    secret: str | None,
    production: bool,
) -> None:
    if not secret:
        if production:
            raise VerificationError("Bot verification is unavailable.")
        if token not in {None, "", "dev-bypass"}:
            raise VerificationError("Invalid development verification token.")
        return

    if not token:
        raise VerificationError("Complete the bot verification before continuing.")

    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": token, "remoteip": remote_ip},
        )
    response.raise_for_status()
    if not response.json().get("success"):
        raise VerificationError("Bot verification failed. Please try again.")
