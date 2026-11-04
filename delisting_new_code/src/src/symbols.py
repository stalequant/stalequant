"""Token name/symbol aliases shared by CMC download and delisting scoring.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from .models.venues import VenueName

__all__ = [
    "EXCH_TOKEN_ALIASES",
    "HYPERLIQUID_K_PREFIX_ALIASES",
    "HYPERLIQUID_WIRE_TOKEN_ALIASES",
    "STABLE_COINS",
    "TOKEN_ALIASES",
    "clean_symbol",
    "hyperliquid_wire_symbol",
    "normalize_hl_coin_name",
]


HYPERLIQUID_K_PREFIX_ALIASES: frozenset[str] = frozenset(
    {"KPEPE", "KLUNC", "KFLOKI", "KNEIRO", "KSHIB", "KBONK"}
)


def normalize_hl_coin_name(name: str) -> str:
    """Normalize known Hyperliquid ``k`` multiplier symbols without touching real K assets."""
    if name.upper() in HYPERLIQUID_K_PREFIX_ALIASES:
        return name[1:]
    return name

STABLE_COINS: frozenset[str] = frozenset(
    {
        "USDC",
        "USDT",
        "USDH",
        "USDE",
        "USD",
        "USDS",
        "USDG",
        "USDF",
        "PYUSD",
        "FDUSD",
        "RLUSD",
        "EURC",
        "APXUSD",
        "GUSD",
        "XAU",
    }
)

# Maps CMC ``name`` or listing symbol variants to preferred upstream symbols.
TOKEN_ALIASES: dict[str, str] = {
    "HPOS10I": "HPOS",
    "HPOS": "HPOS",
    "HPO": "HPOS",
    "BITCOIN": "HPOS",
    "NEIROCTO": "NEIRO",
    "1MCHEEMS": "CHEEMS",
    "1MBABYDOGE": "BABYDOGE",
    "JELLYJELLY": "JELLY",
    "UBTC": "BTC",
    "UETH": "ETH",
    "USOL": "SOL",
    "UFART": "FARTCOIN",
    "HPENGU": "PENGU",
    "UPUMP": "PUMP",
    "UUUSPX": "UUUSPX",
    "UBONK": "BONK",
    "UXPL": "XPL",
    "UWLD": "WLD",
    "LINK0": "LINK",
    "AVAX0": "AVAX",
    "AAVE0": "AAVE",
    "Neiro Ethereum": "NEIROETH",
    "HarryPotterObamaSonic10Inu (ERC-20)": "HPOS",
    "FRAX": "FXS",
    "Frax (prev. FXS)": "FXS",
    "XAUT0": "XAUT",
    "BabyDoge": "BabyDoge".upper(),
    "TSTBSC": "TST",
    "BEAMX": "BEAM",
    "RONIN": "RON",
}

# Per-exchange symbol variants before applying :data:`TOKEN_ALIASES`.
EXCH_TOKEN_ALIASES: dict[tuple[str, str], str] = {
    ("NEIRO", "bybit"): "NEIROETH",
    ("NEIRO", "gate"): "NEIROETH",
    ("NEIRO", "kucoin"): "NEIROETH",
    ("KPEPE", "hyperliquid"): "PEPE",
    ("KLUNC", "hyperliquid"): "LUNC",
    ("KFLOKI", "hyperliquid"): "FLOKI",
    ("KNEIRO", "hyperliquid"): "NEIRO",
    ("KSHIB", "hyperliquid"): "SHIB",
    ("KBONK", "hyperliquid"): "BONK",
}

HYPERLIQUID_WIRE_TOKEN_ALIASES: dict[str, str] = {
    canonical: f"k{raw[1:]}" if raw.startswith("K") else raw
    for (raw, exch), canonical in EXCH_TOKEN_ALIASES.items()
    if exch == VenueName.HYPERLIQUID.value
}


def hyperliquid_wire_symbol(symbol: str) -> str:
    """Return the Hyperliquid l2Book symbol for a normalized display symbol."""
    return HYPERLIQUID_WIRE_TOKEN_ALIASES.get(symbol.upper(), symbol)


def clean_symbol(symbol: str, exch: str | VenueName = "") -> str:
    """Normalize base asset id: pair stem, per-exchange alias, HL ``k`` prefix, multiplier prefixes."""
    exch_key = str(getattr(exch, "value", exch)).lower()
    base = symbol.split("/", maxsplit=1)[0].upper()

    base = EXCH_TOKEN_ALIASES.get((base, exch_key), base)

    if exch_key == VenueName.HYPERLIQUID.value:
        base = normalize_hl_coin_name(base)
        base = base.upper()

    for prefix in ("10000000", "1000000", "1000"):
        if base.startswith(prefix) and len(base) > len(prefix):
            base = base[len(prefix) :]
            break

    return TOKEN_ALIASES.get(base, base)
