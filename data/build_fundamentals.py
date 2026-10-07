import json
import logging
import os
import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.universe import FALLBACK_NIFTY_SYMBOLS
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_fundamentals")

# Symbol normalization for Yahoo Finance
YAHOO_SYMBOL_OVERRIDES = {
    "M&M": "M&M.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "L&TFH": "LTF.NS",
    "MCDOWELL-N": "UNITDSPR.NS",
    "NAM-INDIA": "NAM-INDIA.NS",
    "TATACONSUM": "TATACONSUM.NS"
}

def get_yahoo_ticker(symbol: str) -> str:
    clean = symbol.strip().upper()
    if clean in YAHOO_SYMBOL_OVERRIDES:
        return YAHOO_SYMBOL_OVERRIDES[clean]
    clean_mapped = clean.replace("&", "_")
    return f"{clean_mapped}.NS" if not clean_mapped.endswith(".NS") else clean_mapped

def build_fundamentals_dataset():
    data_dir = Path(__file__).resolve().parent.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_file = data_dir / "nse_fundamentals_database.json"

    existing_data = {}
    if out_file.exists():
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            logger.info(f"Loaded {len(existing_data)} existing entries from {out_file}")
        except Exception as e:
            logger.warning(f"Error loading existing database: {e}")

    symbols = [s[0] for s in FALLBACK_NIFTY_SYMBOLS]
    # Add other prominent NIFTY stocks if not already present
    extra_prominent = [
        "ADANIPOWER", "JINDALSTEL", "IRCTC", "TATACOMM", "KPITTECH", "PERSISTENT",
        "COFORGE", "MPHASIS", "LTTS", "POLICYBZR", "PAYTM", "NYKAA", "DELHIVERY",
        "DEEPAKNTR", "POLYCAB", "KALYANKJIL", "HDFCAMC", "MUTHOOTFIN", "PIIND", "ASTRAL"
    ]
    for s in extra_prominent:
        if s not in symbols:
            symbols.append(s)

    logger.info(f"Fetching fundamentals for {len(symbols)} stocks...")
    success_count = 0

    for idx, sym in enumerate(symbols, start=1):
        clean_sym = sym.strip().upper()
        if clean_sym in existing_data and existing_data[clean_sym].get("trailing_pe") is not None:
            logger.info(f"[{idx}/{len(symbols)}] Skipping {clean_sym} (already present)")
            success_count += 1
            continue

        ticker_sym = get_yahoo_ticker(clean_sym)
        logger.info(f"[{idx}/{len(symbols)}] Querying {clean_sym} ({ticker_sym})...")

        try:
            ticker = yf.Ticker(ticker_sym)
            info = ticker.info or {}
            
            # Extract metrics
            company_name = info.get("longName") or info.get("shortName") or clean_sym
            current_price = info.get("currentPrice") or info.get("regularMarketPrice") or 0.0
            trailing_eps = info.get("trailingEps")
            forward_eps = info.get("forwardEps")
            trailing_pe = info.get("trailingPE")
            forward_pe = info.get("forwardPE")
            price_to_book = info.get("priceToBook")
            book_value = info.get("bookValue")
            debt_to_equity = info.get("debtToEquity")
            dividend_yield = (info.get("dividendYield") or 0.0) * (100 if info.get("dividendYield", 0) < 1 else 1)
            return_on_equity = (info.get("returnOnEquity") or 0.0) * 100
            market_cap_crores = (info.get("marketCap") or 0) / 10000000
            high_52w = info.get("fiftyTwoWeekHigh") or 0.0
            low_52w = info.get("fiftyTwoWeekLow") or 0.0
            profit_margins = (info.get("profitMargins") or 0.0) * 100
            operating_margins = (info.get("operatingMargins") or 0.0) * 100
            sector = info.get("sector") or "Equities"
            industry = info.get("industry") or "NSE"

            # Construct verified Screener-style Strengths & Weaknesses
            strengths = []
            weaknesses = []

            if trailing_pe and trailing_pe < 25:
                strengths.append(f"Valuation comfort: Trading at a sensible P/E of {trailing_pe:.1f}x.")
            elif trailing_pe and trailing_pe > 55:
                weaknesses.append(f"Rich valuation multiple: P/E stands at {trailing_pe:.1f}x.")
            else:
                strengths.append(f"Balanced valuation multiple at {trailing_pe:.1f}x." if trailing_pe else "Market-consistent valuation.")

            if return_on_equity and return_on_equity >= 14:
                strengths.append(f"High capital efficiency with Return on Equity (ROE) of {return_on_equity:.1f}%.")
            elif return_on_equity and return_on_equity < 8:
                weaknesses.append(f"Subdued capital productivity: ROE at {return_on_equity:.1f}%.")

            if debt_to_equity is not None:
                if debt_to_equity < 40:
                    strengths.append(f"Virtually debt-free / Low leverage: D/E ratio at {debt_to_equity:.1f}%.")
                elif debt_to_equity > 120:
                    weaknesses.append(f"Elevated balance sheet debt: D/E ratio at {debt_to_equity:.1f}%.")
            else:
                strengths.append("Unencumbered institutional balance sheet profile.")

            if trailing_eps and trailing_eps > 0:
                strengths.append(f"Demonstrated operating profitability: Trailing EPS ₹{trailing_eps:.2f}.")

            if profit_margins and profit_margins >= 12:
                strengths.append(f"Healthy bottom-line profitability: Net margin of {profit_margins:.1f}%.")
            elif profit_margins and profit_margins < 4:
                weaknesses.append(f"Compressed margin profile: Net margin of {profit_margins:.1f}%.")

            if not weaknesses:
                weaknesses.append("Subject to broader market volatility and macroeconomic cycle fluctuations.")

            existing_data[clean_sym] = {
                "symbol": clean_sym,
                "company": company_name,
                "current_price": round(float(current_price), 2) if current_price else 0.0,
                "market_cap_cr": round(float(market_cap_crores), 2) if market_cap_crores else 0.0,
                "trailing_pe": round(float(trailing_pe), 2) if trailing_pe else None,
                "forward_pe": round(float(forward_pe), 2) if forward_pe else None,
                "trailing_eps": round(float(trailing_eps), 2) if trailing_eps else None,
                "forward_eps": round(float(forward_eps), 2) if forward_eps else None,
                "price_to_book": round(float(price_to_book), 2) if price_to_book else None,
                "book_value": round(float(book_value), 2) if book_value else None,
                "debt_to_equity": round(float(debt_to_equity), 2) if debt_to_equity is not None else None,
                "dividend_yield": round(float(dividend_yield), 2) if dividend_yield else None,
                "return_on_equity": round(float(return_on_equity), 2) if return_on_equity else None,
                "profit_margins": round(float(profit_margins), 2) if profit_margins else None,
                "operating_margins": round(float(operating_margins), 2) if operating_margins else None,
                "high_52w": round(float(high_52w), 2) if high_52w else 0.0,
                "low_52w": round(float(low_52w), 2) if low_52w else 0.0,
                "sector": sector,
                "industry": industry,
                "strengths": strengths[:4],
                "weaknesses": weaknesses[:2]
            }
            success_count += 1
            # Rate limit politeness
            time.sleep(0.3)
        except Exception as e:
            logger.warning(f"Error fetching {clean_sym}: {e}")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)

    logger.info(f"Done! Saved {len(existing_data)} stock fundamentals to {out_file}")

if __name__ == "__main__":
    build_fundamentals_dataset()
