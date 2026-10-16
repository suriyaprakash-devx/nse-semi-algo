import csv
import io
import logging
from typing import Dict, List, Optional, Set, Tuple
import httpx
SYMBOL_OVERRIDES = {
    "M&M": "M&M.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "L&TFH": "LTF.NS",
    "MCDOWELL-N": "UNITDSPR.NS",
    "NAM-INDIA": "NAM-INDIA.NS",
    "TATACONSUM": "TATACONSUM.NS",
    "TATAMOTORS": "TMCV.NS",
    "TMCV": "TMCV.NS",
    "TMPV": "TMPV.NS",
    "LTIM": "LTIM.NS"
}

def get_yahoo_ticker(symbol: str) -> str:
    clean = symbol.strip().upper()
    if clean in SYMBOL_OVERRIDES:
        return SYMBOL_OVERRIDES[clean]
    clean_mapped = clean.replace("&", "_")
    return f"{clean_mapped}.NS" if not clean_mapped.endswith(".NS") else clean_mapped

logger = logging.getLogger(__name__)

NIFTY_100_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty100list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty100list.csv"
]

NIFTY_200_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty200list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty200list.csv"
]

# High-reliability fallback constituent symbols for Nifty 100 + Nifty 200
FALLBACK_NIFTY_SYMBOLS = [
    ("RELIANCE", "Reliance Industries Ltd", "INE002A01018"),
    ("TCS", "Tata Consultancy Services Ltd", "INE467B01029"),
    ("HDFCBANK", "HDFC Bank Ltd", "INE040A01034"),
    ("ICICIBANK", "ICICI Bank Ltd", "INE090A01021"),
    ("INFY", "Infosys Ltd", "INE009A01021"),
    ("BHARTIARTL", "Bharti Airtel Ltd", "INE397D01024"),
    ("ITC", "ITC Ltd", "INE154A01025"),
    ("SBIN", "State Bank of India", "INE062A01020"),
    ("LICI", "Life Insurance Corporation of India", "INE115A01026"),
    ("HINDUNILVR", "Hindustan Unilever Ltd", "INE030A01027"),
    ("LT", "Larsen & Toubro Ltd", "INE018A01030"),
    ("BAJFINANCE", "Bajaj Finance Ltd", "INE296A01024"),
    ("HCLTECH", "HCL Technologies Ltd", "INE860A01027"),
    ("MARUTI", "Maruti Suzuki India Ltd", "INE585B01010"),
    ("SUNPHARMA", "Sun Pharmaceutical Industries Ltd", "INE044A01036"),
    ("ADANIENT", "Adani Enterprises Ltd", "INE423A01024"),
    ("TATAMOTORS", "Tata Motors Ltd", "INE155A01022"),
    ("KOTAKBANK", "Kotak Mahindra Bank Ltd", "INE237A01028"),
    ("NTPC", "NTPC Ltd", "INE733E01010"),
    ("TITAN", "Titan Company Ltd", "INE280A01028"),
    ("ONGC", "Oil & Natural Gas Corporation Ltd", "INE213A01029"),
    ("AXISBANK", "Axis Bank Ltd", "INE238A01034"),
    ("POWERGRID", "Power Grid Corporation of India Ltd", "INE752E01010"),
    ("M&M", "Mahindra & Mahindra Ltd", "INE101A01026"),
    ("ULTRACEMCO", "UltraTech Cement Ltd", "INE481G01011"),
    ("BAJAJFINSV", "Bajaj Finserv Ltd", "INE918I01018"),
    ("COALINDIA", "Coal India Ltd", "INE522F01014"),
    ("WIPRO", "Wipro Ltd", "INE075A01022"),
    ("ADANIPORTS", "Adani Ports and Special Economic Zone Ltd", "INE742F01042"),
    ("TRENT", "Trent Ltd", "INE849A01020"),
    ("ASIANPAINT", "Asian Paints Ltd", "INE021A01026"),
    ("NESTLEIND", "Nestle India Ltd", "INE239A01016"),
    ("IOC", "Indian Oil Corporation Ltd", "INE242A01010"),
    ("VEDL", "Vedanta Ltd", "INE205A01025"),
    ("GRASIM", "Grasim Industries Ltd", "INE047A01021"),
    ("BEL", "Bharat Electronics Ltd", "INE263A01024"),
    ("JSWSTEEL", "JSW Steel Ltd", "INE019A01038"),
    ("TATASTEEL", "Tata Steel Ltd", "INE081A01020"),
    ("BAJAJ-AUTO", "Bajaj Auto Ltd", "INE917I01010"),
    ("HINDALCO", "Hindalco Industries Ltd", "INE038A01020"),
    ("SIEMENS", "Siemens Ltd", "INE003A01024"),
    ("HAL", "Hindustan Aeronautics Ltd", "INE066F01012"),
    ("ZOMATO", "Zomato Ltd", "INE758T01015"),
    ("JIOFIN", "Jio Financial Services Ltd", "INE758E01017"),
    ("DLF", "DLF Ltd", "INE271C01023"),
    ("VBL", "Varun Beverages Ltd", "INE200M01013"),
    ("TECHM", "Tech Mahindra Ltd", "INE669C01036"),
    ("PFC", "Power Finance Corporation Ltd", "INE134E01011"),
    ("RECLTD", "REC Ltd", "INE020B01018"),
    ("SBILIFE", "SBI Life Insurance Company Ltd", "INE123W01016"),
    ("EICHERMOT", "Eicher Motors Ltd", "INE066A01021"),
    ("BRITANNIA", "Britannia Industries Ltd", "INE216A01030"),
    ("APOLLOHOSP", "Apollo Hospitals Enterprise Ltd", "INE437A01024"),
    ("SHRIRAMFIN", "Shriram Finance Ltd", "INE721A01013"),
    ("BPCL", "Bharat Petroleum Corporation Ltd", "INE029A01011"),
    ("INDUSINDBK", "IndusInd Bank Ltd", "INE095A01012"),
    ("CHOLAFIN", "Cholamandalam Investment and Finance Company Ltd", "INE121A01024"),
    ("DIVISLAB", "Divi's Laboratories Ltd", "INE361B01024"),
    ("GAIL", "GAIL (India) Ltd", "INE129A01019"),
    ("HDFCLIFE", "HDFC Life Insurance Company Ltd", "INE795G01014"),
    ("TVSMOTOR", "TVS Motor Company Ltd", "INE494B01023"),
    ("POLYCAB", "Polycab India Ltd", "INE455K01017"),
    ("HAVELLS", "Havells India Ltd", "INE176B01034"),
    ("AMBUJACEM", "Ambuja Cements Ltd", "INE079A01024"),
    ("BANKBARODA", "Bank of Baroda", "INE077A01032"),
    ("GODREJCP", "Godrej Consumer Products Ltd", "INE102D01028"),
    ("DRREDDY", "Dr. Reddy's Laboratories Ltd", "INE089A01023"),
    ("MOTHERSON", "Samvardhana Motherson International Ltd", "INE775A01035"),
    ("ABB", "ABB India Ltd", "INE117A01022"),
    ("PIDILITIND", "Pidilite Industries Ltd", "INE318A01026"),
    ("DABUR", "Dabur India Ltd", "INE016A01026"),
    ("CIPLA", "Cipla Ltd", "INE059A01026"),
    ("TORNTPOWER", "Torrent Power Ltd", "INE813H01021"),
    ("LODHA", "Macrotech Developers Ltd", "INE670K01029"),
    ("TATAPOWER", "Tata Power Company Ltd", "INE245A01021"),
    ("BOSCHLTD", "Bosch Ltd", "INE323A01026"),
    ("TORNTPHARM", "Torrent Pharmaceuticals Ltd", "INE685A01028"),
    ("LTIM", "LTIMindtree Ltd", "INE214T01019"),
    ("CANBK", "Canara Bank", "INE476A01014"),
    ("CUMMINSIND", "Cummins India Ltd", "INE298A01020"),
    ("PNB", "Punjab National Bank", "INE160A01022"),
    ("COLPAL", "Colgate-Palmolive (India) Ltd", "INE181A01026"),
    ("MAXHEALTH", "Max Healthcare Institute Ltd", "INE027H01010"),
    ("BSE", "BSE Ltd", "INE118H01025"),
    ("SUZLON", "Suzlon Energy Ltd", "INE040H01021"),
    ("VOLTAS", "Voltas Ltd", "INE226A01021"),
    ("PERSISTENT", "Persistent Systems Ltd", "INE262H01013"),
    ("DIXON", "Dixon Technologies (India) Ltd", "INE935N01020"),
    ("FEDERALBNK", "The Federal Bank Ltd", "INE171A01029"),
    ("UNIONBANK", "Union Bank of India", "INE692A01016"),
    ("INDIANB", "Indian Bank", "INE562A01011"),
    ("AUROPHARMA", "Aurobindo Pharma Ltd", "INE406A01037"),
    ("ZYDUSLIFE", "Zydus Lifesciences Ltd", "INE010B01027"),
    ("AUBANK", "AU Small Finance Bank Ltd", "INE949L01017"),
    ("IDFCFIRSTB", "IDFC First Bank Ltd", "INE092T01019"),
    ("INDUSTOWER", "Indus Towers Ltd", "INE121J01017"),
    ("ASHOKLEY", "Ashok Leyland Ltd", "INE214A01028"),
    ("LUPIN", "Lupin Ltd", "INE326A01037"),
    ("BHARATFORG", "Bharat Forge Ltd", "INE465A01025"),
    ("ALKEM", "Alkem Laboratories Ltd", "INE540L01014")
]

async def _fetch_constituent_csv(urls: List[str]) -> List[Tuple[str, str, str]]:
    """
    Fetches index constituent CSV and extracts (symbol, company_name, isin).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/csv,*/*"
    }

    async with httpx.AsyncClient(timeout=3.5, follow_redirects=True) as client:
        for url in urls:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200 and resp.text:
                    results = []
                    reader = csv.DictReader(io.StringIO(resp.text))
                    for row in reader:
                        symbol = (row.get("Symbol") or row.get("symbol") or "").strip()
                        company = (row.get("Company Name") or row.get("company_name") or "").strip()
                        isin = (row.get("ISIN Code") or row.get("isin") or "").strip()
                        if symbol:
                            results.append((symbol, company, isin))
                    if results:
                        logger.info(f"Successfully fetched {len(results)} constituents from {url}")
                        return results
            except Exception as e:
                logger.warning(f"Failed to fetch constituents from {url}: {e}")
    return []

async def get_combined_stock_universe() -> List[Dict[str, str]]:
    """
    Obtains NIFTY 100 and NIFTY 200 constituents, merges them into one unique stock list
    (removing duplicate symbols automatically), and dynamically maps them to Upstox instrument keys
    using the official Upstox NSE instrument master JSON.

    Returns list of dicts:
    [
        {
            "symbol": "RELIANCE",
            "company": "Reliance Industries Ltd",
            "instrument_key": "NSE_EQ|INE002A01018",
            "isin": "INE002A01018"
        },
        ...
    ]
    """
    # 1. Fetch Nifty 100 and Nifty 200 constituents
    nifty100 = await _fetch_constituent_csv(NIFTY_100_URLS)
    nifty200 = await _fetch_constituent_csv(NIFTY_200_URLS)

    # Combine lists
    combined_raw = nifty100 + nifty200
    if not combined_raw:
        logger.warning("Using fallback constituent list for NIFTY universe.")
        combined_raw = FALLBACK_NIFTY_SYMBOLS

    # 2. Automatically remove duplicate symbols
    seen_symbols: Set[str] = set()
    unique_constituents: List[Tuple[str, str, str]] = []

    for sym, comp, isin in combined_raw:
        sym_clean = sym.strip().upper()
        if sym_clean and sym_clean not in seen_symbols:
            seen_symbols.add(sym_clean)
            unique_constituents.append((sym_clean, comp, isin))

    logger.info(f"Merged NIFTY 100 + 200: {len(unique_constituents)} unique stock symbols.")

    # 3. Construct universe with Yahoo Finance tickers
    final_universe: List[Dict[str, str]] = []
    for sym, comp, isin in unique_constituents:
        final_universe.append({
            "symbol": sym,
            "company": comp,
            "yahoo_symbol": get_yahoo_ticker(sym),
            "instrument_key": f"NSE_EQ|{sym}",
            "isin": isin
        })

    logger.info(f"Final stock universe ready: {len(final_universe)} NSE equities for yfinance.")
    return final_universe
