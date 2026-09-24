import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from backend.config import settings

logger = logging.getLogger("scanner.universe")

# Authoritative list of NSE high-volume, liquid active equities (NIFTY 200 + NSE Most Active)
NIFTY_200_SYMBOLS = [
    # NIFTY 50 & NIFTY Next 50 (Large Caps)
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "BHARTIARTL", "INFY", "ITC", "SBIN",
    "LICI", "HINDUNILVR", "LT", "HCLTECH", "BAJFINANCE", "SUNPHARMA", "MARUTI",
    "ONGC", "KOTAKBANK", "TATAMOTORS", "NTPC", "AXISBANK", "TITAN", "ADANIENT",
    "ADANIPORTS", "ULTRACEMCO", "POWERGRID", "COALINDIA", "TATASTEEL", "BAJAJFINSV",
    "SIEMENS", "ASIANPAINT", "NESTLEIND", "ZOMATO", "JSWSTEEL", "IOC", "HAL",
    "BEL", "GRASIM", "TECHM", "WIPRO", "HINDALCO", "INDUSINDBK", "DLF", "JIOFIN",
    "DIVISLAB", "ADANIPOWER", "CIPLA", "VEDL", "EICHERMOT", "SBILIFE", "TRENT",
    "BPCL", "PFC", "RECLTD", "SHRIRAMFIN", "BRITANNIA", "CHOLAFIN", "DRREDDY",
    "TATACONSUM", "HINDZINC", "TVSMOTOR", "HDFCLIFE", "APOLLOHOSP", "BAJAJ-AUTO",
    "GODREJCP", "GAIL", "ABB", "MOTHERSON", "PIDILITIND", "AMBUJACEM", "HAVELLS",
    "INDIGO", "BANKBARODA", "CANBK", "PNB", "IOB", "UNIONBANK", "IDBI",
    "INDIANB", "UCOBANK", "CENTRALBK", "BANKINDIA", "POLYCAB", "CUMMINSIND",
    "CGPOWER", "SOLARINDS", "BOSCHLTD", "PERSISTENT", "OFSS", "MAXHEALTH",
    "LUPIN", "AUROPHARMA", "ZYDUSLIFE", "MANKIND", "ALKEM", "TORNTPHARM",
    "COLPAL", "DABUR", "MARICO", "PGHH", "BERGEPAINT",

    # NIFTY Midcap & NSE Active Stocks
    "ACC", "ASTRAL", "AUBANK", "BALKRISIND", "BANDHANBNK", "BATAINDIA",
    "BDL", "BHARATFORG", "BHEL", "BIOCON", "BSOFT", "CANFINHOME", "CDSL",
    "COFORGE", "CONCOR", "CROMPTON", "DEEPAKNTR", "DELHIVERY",
    "DIXON", "ESCORTS", "EXIDEIND", "FEDERALBNK", "FORTIS",
    "GMRAIRPORT", "GNFC", "GODREJPROP", "GRANULES", "HDFCAMC",
    "HINDPETRO", "HUDCO", "IDFCFIRSTB", "IEX", "IGL", "INDHOTEL", "IPCALAB",
    "IRCTC", "IRFC", "JINDALSTEL", "JSWENERGY", "JUBLFOOD", "KALYANKJIL",
    "KPITTECH", "LTF", "LALPATHLAB", "LAURUSLABS", "LICHSGFIN", "LTTS",
    "M&MFIN", "MFSL", "MPHASIS", "MRF", "MUTHOOTFIN", "NATIONALUM",
    "NAVINFLUOR", "NBCC", "NHPC", "NLCINDIA", "NMDC", "OBEROIRLTY", "OIL",
    "PAGEIND", "PATANJALI", "PETRONET", "PHOENIXLTD", "POONAWALLA", "PRESTIGE",
    "RADICO", "RVNL", "SAIL", "SCHAEFFLER", "SJVN", "SONACOMS",
    "SRF", "SUNTV", "SUPREMEIND", "SUZLON",
    "TATACHEM", "TATACOMM", "TATAELXSI", "TATATECH", "TORNTPOWER",
    "TRIDENT", "UBL", "UPL", "VOLTAS", "YESBANK",

    # NSE Official Most Active Stocks by Volume and Value
    "IDEA", "COCHINSHIP", "MAZDOCK", "BSE", "MCX", "RAILTEL", "IRB",
    "IREDA", "POLICYBZR", "ANGELONE", "APLAPOLLO", "INDIAMART", "KAYNES", "BEML"
]

# Set of Top Active Equities featured on the NSE India website
NSE_TOP_ACTIVE_SYMBOLS: Set[str] = {
    "IDEA", "SUZLON", "YESBANK", "IREDA", "RVNL", "IRFC", "NHPC", "SJVN", "NBCC",
    "COCHINSHIP", "MAZDOCK", "BSE", "MCX", "RAILTEL", "CDSL", "ZOMATO", "JIOFIN",
    "TATASTEEL", "BHEL", "SAIL", "PNB", "TRENT", "HAL", "BEL", "HUDCO", "RELIANCE",
    "HDFCBANK", "ICICIBANK", "SBIN", "INFY", "ITC", "AXISBANK", "TCS", "KALYANKJIL"
}

COMPANY_NAME_OVERRIDES: Dict[str, str] = {
    "RELIANCE": "Reliance Industries Ltd",
    "TCS": "Tata Consultancy Services Ltd",
    "HDFCBANK": "HDFC Bank Ltd",
    "ICICIBANK": "ICICI Bank Ltd",
    "BHARTIARTL": "Bharti Airtel Ltd",
    "INFY": "Infosys Ltd",
    "ITC": "ITC Ltd",
    "SBIN": "State Bank of India",
    "LICI": "Life Insurance Corp of India",
    "HINDUNILVR": "Hindustan Unilever Ltd",
    "LT": "Larsen & Toubro Ltd",
    "HCLTECH": "HCL Technologies Ltd",
    "BAJFINANCE": "Bajaj Finance Ltd",
    "SUNPHARMA": "Sun Pharmaceutical Industries",
    "MARUTI": "Maruti Suzuki India Ltd",
    "ONGC": "Oil & Natural Gas Corp Ltd",
    "KOTAKBANK": "Kotak Mahindra Bank Ltd",
    "TATAMOTORS": "Tata Motors Ltd",
    "NTPC": "NTPC Ltd",
    "AXISBANK": "Axis Bank Ltd",
    "TITAN": "Titan Company Ltd",
    "ADANIENT": "Adani Enterprises Ltd",
    "ADANIPORTS": "Adani Ports & SEZ Ltd",
    "ULTRACEMCO": "UltraTech Cement Ltd",
    "POWERGRID": "Power Grid Corp of India",
    "COALINDIA": "Coal India Ltd",
    "TATASTEEL": "Tata Steel Ltd",
    "BAJAJFINSV": "Bajaj Finserv Ltd",
    "SIEMENS": "Siemens Ltd",
    "ASIANPAINT": "Asian Paints Ltd",
    "NESTLEIND": "Nestle India Ltd",
    "ZOMATO": "Zomato Ltd",
    "JSWSTEEL": "JSW Steel Ltd",
    "IOC": "Indian Oil Corp Ltd",
    "HAL": "Hindustan Aeronautics Ltd",
    "BEL": "Bharat Electronics Ltd",
    "GRASIM": "Grasim Industries Ltd",
    "TECHM": "Tech Mahindra Ltd",
    "WIPRO": "Wipro Ltd",
    "HINDALCO": "Hindalco Industries Ltd",
    "INDUSINDBK": "IndusInd Bank Ltd",
    "DLF": "DLF Ltd",
    "JIOFIN": "Jio Financial Services Ltd",
    "IREDA": "Indian Renewable Energy Dev Agency",
    "POLICYBZR": "PB Fintech Ltd",
    "ANGELONE": "Angel One Ltd",
    "APLAPOLLO": "APL Apollo Tubes Ltd",
    "INDIAMART": "IndiaMART InterMESH Ltd",
    "IDEA": "Vodafone Idea Ltd",
    "COCHINSHIP": "Cochin Shipyard Ltd",
    "MAZDOCK": "Mazagon Dock Shipbuilders Ltd",
    "BSE": "BSE Ltd",
    "MCX": "Multi Commodity Exchange of India Ltd",
    "RAILTEL": "RailTel Corp of India Ltd",
    "KAYNES": "Kaynes Technology India Ltd",
    "BEML": "BEML Ltd"
}

class UniverseManager:
    """
    Manages the 200 NSE stock universe including NSE Most Active Stocks.
    Maps NSE trading symbols to companies and yfinance symbols.
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or settings.DATA_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.universe_file = self.cache_dir / "nse_universe.json"
        self._company_map: Dict[str, str] = {}
        self._load_company_map()

    def _load_company_map(self):
        if self.universe_file.exists():
            try:
                with open(self.universe_file, "r", encoding="utf-8") as f:
                    self._company_map = json.load(f)
            except Exception as e:
                logger.warning("Failed to load nse_universe.json: %s", e)

    def get_universe(self) -> List[Dict[str, Any]]:
        """
        Returns exactly unique NSE stocks with:
        symbol, company, yfinance_symbol, is_top_active
        Target: exactly 200 stocks.
        """
        seen = set()
        unique_symbols = []
        for s in NIFTY_200_SYMBOLS:
            clean = s.upper().strip()
            if clean and clean not in seen:
                seen.add(clean)
                unique_symbols.append(clean)

        max_stocks = min(len(unique_symbols), settings.MAX_STOCKS)
        selected_symbols = sorted(unique_symbols[:max_stocks])

        universe: List[Dict[str, Any]] = []
        for symbol in selected_symbols:
            company = COMPANY_NAME_OVERRIDES.get(
                symbol,
                self._company_map.get(symbol, f"{symbol} Ltd")
            )
            if company.isupper():
                company = company.title()

            universe.append({
                "symbol": symbol,
                "company": company,
                "yfinance_symbol": f"{symbol}.NS",
                "exchange": "NSE",
                "is_top_active": symbol in NSE_TOP_ACTIVE_SYMBOLS
            })

        return universe

    def get_universe_symbols(self) -> List[str]:
        return [item["symbol"] for item in self.get_universe()]

    def get_top_active_symbols(self) -> List[str]:
        return sorted(list(NSE_TOP_ACTIVE_SYMBOLS))

universe_manager = UniverseManager()
