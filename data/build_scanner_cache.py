import asyncio
import json
import logging
import time
from datetime import datetime
from pathlib import Path
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# List of top NSE stocks with company names and instrument tokens
STOCKS = [
    ("RELIANCE", "Reliance Industries Ltd", "NSE_EQ|INE002A01018", True, True),
    ("TCS", "Tata Consultancy Services Ltd", "NSE_EQ|INE467B01029", True, True),
    ("HDFCBANK", "HDFC Bank Ltd", "NSE_EQ|INE040A01034", True, True),
    ("ICICIBANK", "ICICI Bank Ltd", "NSE_EQ|INE090A01021", True, True),
    ("INFY", "Infosys Ltd", "NSE_EQ|INE009A01021", True, True),
    ("BHARTIARTL", "Bharti Airtel Ltd", "NSE_EQ|INE397D01024", True, True),
    ("ITC", "ITC Ltd", "NSE_EQ|INE154A01025", True, True),
    ("SBIN", "State Bank of India", "NSE_EQ|INE062A01020", True, True),
    ("LICI", "Life Insurance Corp of India", "NSE_EQ|INE115A01026", False, True),
    ("HINDUNILVR", "Hindustan Unilever Ltd", "NSE_EQ|INE030A01027", True, True),
    ("LT", "Larsen & Toubro Ltd", "NSE_EQ|INE018A01030", True, True),
    ("BAJFINANCE", "Bajaj Finance Ltd", "NSE_EQ|INE296A01024", True, True),
    ("HCLTECH", "HCL Technologies Ltd", "NSE_EQ|INE860A01027", True, True),
    ("MARUTI", "Maruti Suzuki India Ltd", "NSE_EQ|INE585B01010", True, True),
    ("SUNPHARMA", "Sun Pharmaceutical Ind Ltd", "NSE_EQ|INE044A01036", True, True),
    ("ADANIENT", "Adani Enterprises Ltd", "NSE_EQ|INE423A01024", True, True),
    ("TATAMOTORS", "Tata Motors Ltd", "NSE_EQ|INE155A01022", True, True),
    ("KOTAKBANK", "Kotak Mahindra Bank Ltd", "NSE_EQ|INE237A01028", True, True),
    ("NTPC", "NTPC Ltd", "NSE_EQ|INE733E01010", True, True),
    ("TITAN", "Titan Company Ltd", "NSE_EQ|INE280A01028", True, True),
    ("ONGC", "Oil & Natural Gas Corp Ltd", "NSE_EQ|INE213A01029", True, True),
    ("AXISBANK", "Axis Bank Ltd", "NSE_EQ|INE238A01034", True, True),
    ("POWERGRID", "Power Grid Corp of India Ltd", "NSE_EQ|INE752E01010", True, True),
    ("M&M", "Mahindra & Mahindra Ltd", "NSE_EQ|INE101A01026", True, True),
    ("ULTRACEMCO", "UltraTech Cement Ltd", "NSE_EQ|INE481G01011", True, True),
    ("BAJAJFINSV", "Bajaj Finserv Ltd", "NSE_EQ|INE918I01018", True, True),
    ("COALINDIA", "Coal India Ltd", "NSE_EQ|INE522F01014", True, True),
    ("WIPRO", "Wipro Ltd", "NSE_EQ|INE075A01022", True, True),
    ("ADANIPORTS", "Adani Ports & SEZ Ltd", "NSE_EQ|INE742F01042", True, True),
    ("TRENT", "Trent Ltd", "NSE_EQ|INE849A01020", True, True),
    ("ASIANPAINT", "Asian Paints Ltd", "NSE_EQ|INE021A01026", True, True),
    ("NESTLEIND", "Nestle India Ltd", "NSE_EQ|INE239A01016", True, True),
    ("IOC", "Indian Oil Corporation Ltd", "NSE_EQ|INE242A01010", False, True),
    ("VEDL", "Vedanta Ltd", "NSE_EQ|INE205A01025", False, True),
    ("GRASIM", "Grasim Industries Ltd", "NSE_EQ|INE047A01021", True, True),
    ("BEL", "Bharat Electronics Ltd", "NSE_EQ|INE263A01024", True, True),
    ("JSWSTEEL", "JSW Steel Ltd", "NSE_EQ|INE019A01038", True, True),
    ("TATASTEEL", "Tata Steel Ltd", "NSE_EQ|INE081A01020", True, True),
    ("BAJAJ-AUTO", "Bajaj Auto Ltd", "NSE_EQ|INE917I01010", True, True),
    ("HINDALCO", "Hindalco Industries Ltd", "NSE_EQ|INE038A01020", True, True),
    ("SIEMENS", "Siemens Ltd", "NSE_EQ|INE003A01024", False, True),
    ("HAL", "Hindustan Aeronautics Ltd", "NSE_EQ|INE066F01012", False, True),
    ("ZOMATO", "Zomato Ltd", "NSE_EQ|INE758T01015", False, True),
    ("JIOFIN", "Jio Financial Services Ltd", "NSE_EQ|INE758E01017", False, True),
    ("DLF", "DLF Ltd", "NSE_EQ|INE271C01023", False, True),
    ("VBL", "Varun Beverages Ltd", "NSE_EQ|INE200M01013", False, True),
    ("TECHM", "Tech Mahindra Ltd", "NSE_EQ|INE669C01036", True, True),
    ("PFC", "Power Finance Corp Ltd", "NSE_EQ|INE134E01011", False, True),
    ("RECLTD", "REC Ltd", "NSE_EQ|INE020B01018", False, True),
    ("SBILIFE", "SBI Life Insurance Co Ltd", "NSE_EQ|INE123W01016", True, True),
    ("EICHERMOT", "Eicher Motors Ltd", "NSE_EQ|INE066A01021", True, True),
    ("BRITANNIA", "Britannia Industries Ltd", "NSE_EQ|INE216A01030", True, True),
    ("APOLLOHOSP", "Apollo Hospitals Ent Ltd", "NSE_EQ|INE437A01024", True, True),
    ("SHRIRAMFIN", "Shriram Finance Ltd", "NSE_EQ|INE721A01013", True, True),
    ("BPCL", "Bharat Petroleum Corp Ltd", "NSE_EQ|INE029A01011", True, True),
    ("INDUSINDBK", "IndusInd Bank Ltd", "NSE_EQ|INE095A01012", True, True),
    ("CHOLAFIN", "Cholamandalam Inv & Fin Co", "NSE_EQ|INE121A01024", False, True),
    ("DIVISLAB", "Divi's Laboratories Ltd", "NSE_EQ|INE361B01024", False, True),
    ("GAIL", "GAIL (India) Ltd", "NSE_EQ|INE129A01019", False, True),
    ("HDFCLIFE", "HDFC Life Insurance Co Ltd", "NSE_EQ|INE795G01014", True, True),
    ("TVSMOTOR", "TVS Motor Company Ltd", "NSE_EQ|INE494B01023", False, True),
    ("POLYCAB", "Polycab India Ltd", "NSE_EQ|INE455K01017", False, True),
    ("HAVELLS", "Havells India Ltd", "NSE_EQ|INE176B01034", False, True),
    ("AMBUJACEM", "Ambuja Cements Ltd", "NSE_EQ|INE079A01024", False, True),
    ("BANKBARODA", "Bank of Baroda", "NSE_EQ|INE077A01032", False, True),
    ("GODREJCP", "Godrej Consumer Products Ltd", "NSE_EQ|INE102D01028", False, True),
    ("DRREDDY", "Dr. Reddy's Laboratories Ltd", "NSE_EQ|INE089A01023", True, True),
    ("MOTHERSON", "Samvardhana Motherson Int Ltd", "NSE_EQ|INE775A01035", False, True),
    ("ABB", "ABB India Ltd", "NSE_EQ|INE117A01022", False, True),
    ("PIDILITIND", "Pidilite Industries Ltd", "NSE_EQ|INE318A01026", False, True),
    ("DABUR", "Dabur India Ltd", "NSE_EQ|INE016A01026", False, True),
    ("CIPLA", "Cipla Ltd", "NSE_EQ|INE059A01026", True, True),
    ("TORNTPOWER", "Torrent Power Ltd", "NSE_EQ|INE813H01021", False, True),
    ("LODHA", "Macrotech Developers Ltd", "NSE_EQ|INE670K01029", False, True),
    ("TATAPOWER", "Tata Power Company Ltd", "NSE_EQ|INE245A01021", False, True),
    ("BOSCHLTD", "Bosch Ltd", "NSE_EQ|INE323A01026", False, True),
    ("TORNTPHARM", "Torrent Pharmaceuticals Ltd", "NSE_EQ|INE685A01028", False, True),
    ("LTIM", "LTIMindtree Ltd", "NSE_EQ|INE214T01019", True, True),
    ("CANBK", "Canara Bank", "NSE_EQ|INE476A01014", False, True),
    ("CUMMINSIND", "Cummins India Ltd", "NSE_EQ|INE298A01020", False, True),
    ("PNB", "Punjab National Bank", "NSE_EQ|INE160A01022", False, True),
    ("COLPAL", "Colgate-Palmolive (India) Ltd", "NSE_EQ|INE181A01026", False, True),
    ("MAXHEALTH", "Max Healthcare Institute Ltd", "NSE_EQ|INE027H01010", False, True),
    ("BSE", "BSE Ltd", "NSE_EQ|INE118H01025", False, True),
    ("SUZLON", "Suzlon Energy Ltd", "NSE_EQ|INE040H01021", False, True),
    ("VOLTAS", "Voltas Ltd", "NSE_EQ|INE226A01021", False, True),
    ("PERSISTENT", "Persistent Systems Ltd", "NSE_EQ|INE262H01013", False, True),
    ("DIXON", "Dixon Technologies (India) Ltd", "NSE_EQ|INE935N01020", False, True),
    ("FEDERALBNK", "The Federal Bank Ltd", "NSE_EQ|INE171A01029", False, True),
    ("UNIONBANK", "Union Bank of India", "NSE_EQ|INE692A01016", False, True),
    ("INDIANB", "Indian Bank", "NSE_EQ|INE562A01011", False, True),
    ("AUROPHARMA", "Aurobindo Pharma Ltd", "NSE_EQ|INE406A01037", False, True),
    ("ZYDUSLIFE", "Zydus Lifesciences Ltd", "NSE_EQ|INE010B01027", False, True),
    ("AUBANK", "AU Small Finance Bank Ltd", "NSE_EQ|INE949L01017", False, True),
    ("IDFCFIRSTB", "IDFC First Bank Ltd", "NSE_EQ|INE092T01019", False, True),
    ("INDUSTOWER", "Indus Towers Ltd", "NSE_EQ|INE121J01017", False, True),
    ("ASHOKLEY", "Ashok Leyland Ltd", "NSE_EQ|INE214A01028", False, True),
    ("LUPIN", "Lupin Ltd", "NSE_EQ|INE326A01037", False, True),
    ("BHARATFORG", "Bharat Forge Ltd", "NSE_EQ|INE465A01025", False, True),
    ("ALKEM", "Alkem Laboratories Ltd", "NSE_EQ|INE540L01014", False, True)
]

def map_yahoo_ticker(sym: str) -> str:
    overrides = {
        "M&M": "M&M.NS",
        "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
        "TATAMOTORS": "TATAMTR.NS",
        "LTIM": "LTIM.NS"
    }
    return overrides.get(sym, f"{sym}.NS")

def build_cache():
    logger.info("Starting high-speed scanner data cache build for NSE universe...")
    t0 = time.time()
    
    ticker_to_meta = {}
    for sym, comp, token, n50, n100 in STOCKS:
        y_tick = map_yahoo_ticker(sym)
        ticker_to_meta[y_tick] = {
            "symbol": sym,
            "company_name": comp,
            "instrument_token": token,
            "nifty_flags": {
                "nifty50": n50,
                "nifty100": n100,
                "nifty200": True
            }
        }
    
    all_tickers = list(ticker_to_meta.keys())
    logger.info(f"Downloading daily candles for {len(all_tickers)} NSE equities...")
    
    # Batch download past 6 months to guarantee > 30 daily candles
    raw_df = yf.download(all_tickers, period="6mo", interval="1d", group_by="ticker", progress=False)
    
    stocks_result = []
    success_count = 0
    
    for y_tick, meta in ticker_to_meta.items():
        try:
            if y_tick in raw_df.columns.levels[0]:
                sub_df = raw_df[y_tick].dropna(how="all")
            else:
                continue
                
            candles = []
            for dt, row in sub_df.iterrows():
                try:
                    c_open = float(row["Open"])
                    c_high = float(row["High"])
                    c_low = float(row["Low"])
                    c_close = float(row["Close"])
                    c_vol = float(row["Volume"])
                    if any(c is None or c != c for c in [c_open, c_high, c_low, c_close, c_vol]):
                        continue
                    dt_str = dt.strftime("%Y-%m-%d")
                    candles.append({
                        "date": dt_str,
                        "open": round(c_open, 2),
                        "high": round(c_high, 2),
                        "low": round(c_low, 2),
                        "close": round(c_close, 2),
                        "volume": int(c_vol)
                    })
                except Exception:
                    continue
                    
            if len(candles) >= 25:
                success_count += 1
                stocks_result.append({
                    "symbol": meta["symbol"],
                    "company_name": meta["company_name"],
                    "instrument_token": meta["instrument_token"],
                    "nifty_flags": meta["nifty_flags"],
                    "daily_candles": candles
                })
        except Exception as e:
            logger.warning(f"Error processing {y_tick}: {e}")
            
    payload = {
        "metadata": {
            "total_stocks": len(stocks_result),
            "scan_timestamp": datetime.now().isoformat(),
            "volume_lookback": 20,
            "volume_multiplier": 3,
            "price_lookback": 20,
            "max_breakout_age": 20,
            "midpoint_tolerance_pct": 1.0,
            "source": "NSE_DAILY_MASTER"
        },
        "stocks": stocks_result
    }
    
    out_path = Path("./data/scanner_data_cache.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
        
    logger.info(f"Done! Saved {success_count} stocks to {out_path} in {time.time()-t0:.2f}s")

if __name__ == "__main__":
    build_cache()
