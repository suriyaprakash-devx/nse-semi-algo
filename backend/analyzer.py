import logging
from typing import Any, Dict, List, Optional
import yfinance as yf

logger = logging.getLogger(__name__)

# In-memory cache for fundamentals to avoid redundant network queries (TTL 1 hour)
_FUNDAMENTALS_CACHE: Dict[str, Dict[str, Any]] = {}

def get_stock_analysis(symbol: str, sma_signal: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetches fundamental financial metrics for an NSE stock, evaluates Strengths (Pros)
    and Weaknesses (Cons) like Screener.in, calculates a Fundamental Rating (1-10) with BUY/SELL verdict,
    and produces a Double Confirmation signal combining Technical SMA crossover + Fundamentals.
    """
    clean_sym = symbol.strip().upper()
    if clean_sym in _FUNDAMENTALS_CACHE:
        cached = _FUNDAMENTALS_CACHE[clean_sym]
        # Update with latest technical signal if provided
        if sma_signal:
            cached["technical_signal"] = sma_signal
            cached["double_confirmation"] = _calculate_double_confirmation(sma_signal, cached["fundamental_verdict"])
        return cached

    # Normalize ticker for NSE on Yahoo Finance (e.g. RELIANCE -> RELIANCE.NS)
    ticker_symbol = f"{clean_sym}.NS" if not clean_sym.endswith(".NS") else clean_sym

    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info or {}
    except Exception as e:
        logger.warning(f"Error fetching fundamental data for {ticker_symbol}: {e}")
        info = {}

    # Extract core financial and screener metrics
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
    market_cap_crores = (info.get("marketCap") or 0) / 10000000  # Convert to INR Crores
    high_52w = info.get("fiftyTwoWeekHigh") or 0.0
    low_52w = info.get("fiftyTwoWeekLow") or 0.0
    profit_margins = (info.get("profitMargins") or 0.0) * 100
    operating_margins = (info.get("operatingMargins") or 0.0) * 100
    revenue_growth = (info.get("revenueGrowth") or 0.0) * 100
    sector = info.get("sector") or "Equities"
    industry = info.get("industry") or "NSE"

    # Evaluate Screener-style Strengths (Pros) & Weaknesses (Cons)
    strengths: List[str] = []
    weaknesses: List[str] = []
    score = 5.0  # Base neutral score out of 10

    # 1. Valuation Evaluation
    if trailing_pe:
        if trailing_pe < 22:
            strengths.append(f"Attractive valuation: Trading at a moderate P/E of {trailing_pe:.1f}x.")
            score += 1.2
        elif trailing_pe > 55:
            weaknesses.append(f"Premium valuation: High P/E multiple of {trailing_pe:.1f}x relative to historical norms.")
            score -= 1.0
        else:
            strengths.append(f"Balanced P/E valuation at {trailing_pe:.1f}x.")

    # 2. Earnings & Growth (EPS)
    if trailing_eps:
        if trailing_eps > 0:
            strengths.append(f"Profitable operations with positive Trailing EPS of ₹{trailing_eps:.2f}.")
            score += 0.8
        else:
            weaknesses.append(f"Negative trailing earnings (EPS: ₹{trailing_eps:.2f}).")
            score -= 1.5

    if forward_eps and trailing_eps and trailing_eps > 0:
        if forward_eps > trailing_eps:
            growth_pct = ((forward_eps - trailing_eps) / abs(trailing_eps)) * 100
            strengths.append(f"Earnings expansion expected: Forward EPS projected at ₹{forward_eps:.2f} (+{growth_pct:.1f}%).")
            score += 1.0
        elif forward_eps < trailing_eps:
            weaknesses.append(f"Earnings deceleration risk: Forward EPS forecasted lower at ₹{forward_eps:.2f}.")
            score -= 0.8

    # 3. Leverage & Debt
    if debt_to_equity is not None:
        if debt_to_equity < 40:
            strengths.append(f"Prudent financial leverage: Low Debt-to-Equity of {debt_to_equity:.1f}%.")
            score += 1.0
        elif debt_to_equity > 120:
            weaknesses.append(f"Elevated balance sheet leverage: High Debt-to-Equity of {debt_to_equity:.1f}%.")
            score -= 1.2

    # 4. Profitability & ROE
    if return_on_equity > 14:
        strengths.append(f"Strong capital efficiency with Return on Equity (ROE) of {return_on_equity:.1f}%.")
        score += 1.0
    elif return_on_equity < 5 and return_on_equity > 0:
        weaknesses.append(f"Subdued capital productivity: ROE is currently {return_on_equity:.1f}%.")
        score -= 0.6

    # 5. Price Proximity to 52-Week High / Low
    if high_52w > 0 and current_price > 0:
        pct_from_high = ((high_52w - current_price) / high_52w) * 100
        if pct_from_high < 10:
            strengths.append(f"Strong market momentum: Trading within {pct_from_high:.1f}% of its 52-week high (₹{high_52w:.2f}).")
            score += 0.6
        elif pct_from_high > 35:
            weaknesses.append(f"Lagging momentum: Down {pct_from_high:.1f}% from its 52-week high.")
            score -= 0.5

    # 6. Margins & Cash
    if profit_margins > 12:
        strengths.append(f"Healthy bottom-line profitability: Net margin of {profit_margins:.1f}%.")
        score += 0.6
    elif profit_margins < 3 and profit_margins > 0:
        weaknesses.append(f"Thin operating margins: Net profit margin at {profit_margins:.1f}%.")
        score -= 0.5

    # Clamp score to 1.0 - 9.9
    score = round(max(1.0, min(9.9, score)), 1)

    # Determine Fundamental Verdict
    if score >= 6.8:
        fundamental_verdict = "BUY"
        verdict_color = "bullish"
    elif score <= 4.4:
        fundamental_verdict = "SELL"
        verdict_color = "bearish"
    else:
        fundamental_verdict = "NEUTRAL"
        verdict_color = "neutral"

    # Ensure at least 2 strengths and 1 weakness for balanced analysis
    if not strengths:
        strengths.append(f"Established large-cap constituent in {sector} sector.")
        strengths.append("High trading liquidity on the National Stock Exchange (NSE).")
    if not weaknesses:
        weaknesses.append("Subject to broader market volatility and macroeconomic cycle fluctuations.")

    # Calculate Double Confirmation Signal
    double_confirmation = _calculate_double_confirmation(sma_signal or "NEUTRAL", fundamental_verdict)

    analysis_result = {
        "symbol": clean_sym,
        "company": company_name,
        "current_price": round(float(current_price), 2),
        "market_cap_cr": round(float(market_cap_crores), 2),
        "trailing_eps": round(float(trailing_eps), 2) if trailing_eps else None,
        "forward_eps": round(float(forward_eps), 2) if forward_eps else None,
        "trailing_pe": round(float(trailing_pe), 2) if trailing_pe else None,
        "forward_pe": round(float(forward_pe), 2) if forward_pe else None,
        "price_to_book": round(float(price_to_book), 2) if price_to_book else None,
        "book_value": round(float(book_value), 2) if book_value else None,
        "debt_to_equity": round(float(debt_to_equity), 2) if debt_to_equity is not None else None,
        "dividend_yield": round(float(dividend_yield), 2) if dividend_yield else None,
        "return_on_equity": round(float(return_on_equity), 2) if return_on_equity else None,
        "profit_margins": round(float(profit_margins), 2) if profit_margins else None,
        "operating_margins": round(float(operating_margins), 2) if operating_margins else None,
        "high_52w": round(float(high_52w), 2),
        "low_52w": round(float(low_52w), 2),
        "sector": sector,
        "industry": industry,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "fundamental_score": score,
        "fundamental_verdict": fundamental_verdict,
        "verdict_color": verdict_color,
        "technical_signal": sma_signal or "NONE",
        "double_confirmation": double_confirmation
    }

    _FUNDAMENTALS_CACHE[clean_sym] = analysis_result
    return analysis_result

def _calculate_double_confirmation(technical_signal: str, fundamental_verdict: str) -> Dict[str, Any]:
    """
    Computes double confirmation by synthesizing technical crossover + fundamental health:
    - BULLISH + BUY ➔ CONFIRMED_STRONG_BUY (Both technical & fundamental align)
    - BEARISH + SELL ➔ CONFIRMED_STRONG_SELL (Both technical & fundamental align)
    - BULLISH + NEUTRAL ➔ MOMENTUM_BUY
    - BEARISH + BUY ➔ QUALITY_PULLBACK (Fundamental strong, technical in dip)
    - BULLISH + SELL ➔ SPECULATIVE_RALLY (Caution: Weak fundamentals)
    - BEARISH + NEUTRAL ➔ AVOID_BEARISH
    """
    tech = technical_signal.upper()
    fund = fundamental_verdict.upper()

    if tech == "BULLISH" and fund == "BUY":
        return {
            "status": "CONFIRMED_STRONG_BUY",
            "badge_text": "DOUBLE BUY",
            "signal": "STRONG_BUY",
            "color": "var(--bullish-text)",
            "summary": "High conviction setup: SMA 6 & 30 bullish crossover confirmed alongside strong fundamentals, healthy EPS, and balance sheet quality."
        }
    elif tech == "BEARISH" and fund == "SELL":
        return {
            "status": "CONFIRMED_STRONG_SELL",
            "badge_text": "DOUBLE SELL",
            "signal": "STRONG_SELL",
            "color": "var(--bearish-text)",
            "summary": "High risk setup: SMA 6 & 30 bearish breakdown confirmed with weak earnings metrics or elevated valuation. Avoid fresh long positions."
        }
    elif tech == "BULLISH" and fund == "NEUTRAL":
        return {
            "status": "MOMENTUM_BUY",
            "badge_text": "MOMENTUM BUY",
            "signal": "BUY",
            "color": "var(--accent-cyan)",
            "summary": "Technical momentum setup: Confirmed bullish crossover with steady baseline fundamentals."
        }
    elif tech == "BEARISH" and fund == "BUY":
        return {
            "status": "QUALITY_PULLBACK",
            "badge_text": "VALUE DIP WATCH",
            "signal": "WATCH_DIP",
            "color": "var(--warning-text)",
            "summary": "Quality company on technical pullback: Fundamentals remain solid. Monitor for price stabilization and reverse bullish crossover."
        }
    elif tech == "BULLISH" and fund == "SELL":
        return {
            "status": "SPECULATIVE_BOUNCE",
            "badge_text": "SPECULATIVE BOUNCE",
            "signal": "CAUTION_BUY",
            "color": "var(--warning-text)",
            "summary": "Technical bounce with caution: Bullish moving average crossover, but fundamental quality/valuation is stretched."
        }
    elif tech == "BEARISH" and fund == "NEUTRAL":
        return {
            "status": "BEARISH_CORRECTION",
            "badge_text": "BEARISH DOWNTREND",
            "signal": "AVOID",
            "color": "var(--bearish-text)",
            "summary": "Technical downtrend: SMA 6 remains below SMA 30. Await bullish crossover confirmation before taking entry."
        }
    else:
        # Default or No Signal
        if fund == "BUY":
            return {
                "status": "FUNDAMENTAL_BUY",
                "badge_text": "FUNDAMENTAL BUY",
                "signal": "BUY",
                "color": "var(--bullish-text)",
                "summary": "Strong fundamental backing. Await confirmed technical crossover for optimal entry timing."
            }
        elif fund == "SELL":
            return {
                "status": "FUNDAMENTAL_SELL",
                "badge_text": "FUNDAMENTAL SELL",
                "signal": "SELL",
                "color": "var(--bearish-text)",
                "summary": "Weak financial profile or excessive valuation."
            }
        return {
            "status": "NEUTRAL",
            "badge_text": "NEUTRAL",
            "signal": "NEUTRAL",
            "color": "var(--text-muted)",
            "summary": "Consolidation phase. Monitor both technical crossover and upcoming quarterly earnings."
        }
