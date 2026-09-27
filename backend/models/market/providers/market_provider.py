"""Market Data Provider Layer for AgriSense Market Intelligence (Phase 1F).

Separates market data retrieval and raw response normalization from the core analysis engine.
Supports both deterministic local mock data and future Agmarknet/data.gov.in live API integration.
"""

from dataclasses import dataclass, asdict
from datetime import datetime
import json
import math
import os
from typing import Dict, Any, List, Optional


class MarketDataError(Exception):
    """Base exception for market data validation and retrieval errors."""
    pass


@dataclass
class NormalizedMarketRecord:
    """Standardized internal representation of an agricultural market record."""
    crop: str
    market: str
    state: Optional[str]
    district: Optional[str]
    date: str  # ISO format 'YYYY-MM-DD'
    min_price: float
    max_price: float
    modal_price: float
    unit: str  # e.g., 'INR/Quintal'
    raw_source: str = "Agmarknet / data.gov.in"

    def to_dict(self) -> Dict[str, Any]:
        """Convert record to plain Python dictionary."""
        return asdict(self)

    @classmethod
    def validate_and_create(cls, raw: Dict[str, Any], default_unit: str = "INR/Quintal") -> "NormalizedMarketRecord":
        """Validate and normalize a raw record dictionary."""
        if not isinstance(raw, dict):
            raise MarketDataError("Market record must be a dictionary.")

        # 1. Validate Crop
        def first_value(*keys: str) -> Any:
            for key in keys:
                value = raw.get(key)
                if value is not None and value != "":
                    return value
            return None

        crop = first_value("crop", "commodity", "Commodity")
        if not crop or not isinstance(crop, str) or not crop.strip():
            raise MarketDataError("Market record missing valid non-empty 'crop' name.")
        crop = crop.strip()

        # 2. Validate Market
        market = first_value("market", "Market", "mandi")
        if not market or not isinstance(market, str) or not market.strip():
            raise MarketDataError("Market record missing valid non-empty 'market' name.")
        market = market.strip()

        # 3. Location fields (optional but normalized if present)
        state = raw.get("state") or raw.get("State")
        if state and isinstance(state, str):
            state = state.strip()
        else:
            state = None

        district = raw.get("district") or raw.get("District")
        if district and isinstance(district, str):
            district = district.strip()
        else:
            district = None

        # 4. Validate Date
        date_str = first_value("date", "Arrival_Date", "arrival_date")
        if not date_str or not isinstance(date_str, str):
            raise MarketDataError("Market record missing valid 'date' string.")
        
        # Parse various common date formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
        normalized_date = cls._normalize_date(date_str.strip())

        # 5. Validate Prices
        min_price = cls._validate_price(first_value("min_price", "Min_Price", "min_price_inr"), "min_price")
        max_price = cls._validate_price(first_value("max_price", "Max_Price", "max_price_inr"), "max_price")
        modal_price = cls._validate_price(first_value("modal_price", "Modal_Price", "modal_price_inr", "price"), "modal_price")

        # Sanity check: min <= modal <= max if min and max are non-zero
        if min_price > max_price:
            raise MarketDataError(f"Invalid price bounds: min_price ({min_price}) > max_price ({max_price}).")
        if modal_price < min_price or modal_price > max_price:
            raise MarketDataError(f"Invalid price bounds: modal_price ({modal_price}) must be between min_price and max_price.")

        # 6. Unit
        unit = raw.get("unit") or raw.get("Unit") or default_unit
        if not isinstance(unit, str) or not unit.strip():
            unit = default_unit
        unit = unit.strip()

        raw_source = raw.get("raw_source") or raw.get("source") or "Agmarknet / data.gov.in"

        return cls(
            crop=crop,
            market=market,
            state=state,
            district=district,
            date=normalized_date,
            min_price=min_price,
            max_price=max_price,
            modal_price=modal_price,
            unit=unit,
            raw_source=str(raw_source)
        )

    @staticmethod
    def _validate_price(val: Any, field_name: str) -> float:
        """Validate that a price is a non-negative number."""
        if val is None:
            raise MarketDataError(f"Field '{field_name}' cannot be None.")
        try:
            num = float(val)
        except (ValueError, TypeError):
            raise MarketDataError(f"Field '{field_name}' must be a numeric value, got: {val!r}")
        
        if not math.isfinite(num):
            raise MarketDataError(f"Invalid non-finite price for '{field_name}'.")
        if num < 0:
            raise MarketDataError(f"Invalid negative price for '{field_name}': {num}")
        return num

    @staticmethod
    def _normalize_date(date_str: str) -> str:
        """Parse and convert date to ISO YYYY-MM-DD."""
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
        raise MarketDataError(f"Date '{date_str}' is not in a recognized format (expected YYYY-MM-DD or DD/MM/YYYY).")


class BaseMarketProvider:
    """Abstract base provider for fetching and filtering market records."""

    def get_records(
        self,
        crop: Optional[str] = None,
        market: Optional[str] = None,
        state: Optional[str] = None
    ) -> List[NormalizedMarketRecord]:
        raise NotImplementedError("Subclasses must implement get_records.")


class LocalMarketDataProvider(BaseMarketProvider):
    """Local deterministic file-backed or in-memory market data provider."""

    def __init__(self, data_file_path: Optional[str] = None, in_memory_records: Optional[List[Dict[str, Any]]] = None):
        self.records: List[NormalizedMarketRecord] = []
        if in_memory_records is not None:
            self._load_from_list(in_memory_records)
        elif data_file_path is not None:
            self._load_from_file(data_file_path)

    def _load_from_file(self, file_path: str) -> None:
        if not os.path.exists(file_path):
            raise MarketDataError(f"Market data file not found: {file_path}")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise MarketDataError(f"Malformed JSON in market data file: {e}")

        raw_list = data.get("records") if isinstance(data, dict) and "records" in data else data
        if not isinstance(raw_list, list):
            raise MarketDataError("Expected a list of records in market data JSON.")
        self._load_from_list(raw_list)

    def _load_from_list(self, raw_list: List[Dict[str, Any]]) -> None:
        self.records = []
        for raw in raw_list:
            record = NormalizedMarketRecord.validate_and_create(raw)
            # Keep the provider provenance explicit even when sample records omit it.
            record.raw_source = "local-fallback"
            self.records.append(record)

    def get_records(
        self,
        crop: Optional[str] = None,
        market: Optional[str] = None,
        state: Optional[str] = None
    ) -> List[NormalizedMarketRecord]:
        """Filter and retrieve normalized records matching query parameters."""
        results = []
        for r in self.records:
            if crop and r.crop.lower() != crop.strip().lower():
                continue
            if market and r.market.lower() != market.strip().lower():
                continue
            if state and r.state and r.state.lower() != state.strip().lower():
                continue
            results.append(r)
        
        # Sort chronologically by date
        results.sort(key=lambda x: x.date)
        return results


class AgmarknetApiProvider(BaseMarketProvider):
    """
    Live market data provider for official Government of India Agmarknet / data.gov.in API.
    Fetches, filters, paginates, and normalizes live market records.
    """

    BASE_ENDPOINT = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
    DEFAULT_LIMIT = 1000
    REQUEST_DELAY_SEC = 0.2

    def __init__(self, api_key: Optional[str] = None, endpoint: Optional[str] = None):
        """
        Initialize Agmarknet API provider.
        
        Args:
            api_key: Optional explicit API key. If not provided, reads from DATA_GOV_IN_API_KEY env var.
            endpoint: Optional override for the resource endpoint URL.
        """
        self.api_key = api_key or os.getenv("DATA_GOV_IN_API_KEY")
        self.endpoint = endpoint or self.BASE_ENDPOINT

    def _require_api_key(self) -> str:
        """Ensure an API key is present before attempting network requests."""
        if not self.api_key or not self.api_key.strip():
            raise MarketDataError(
                "DATA_GOV_IN_API_KEY is not configured. "
                "Please add DATA_GOV_IN_API_KEY=your_key_here to your .env file or pass api_key explicitly."
            )
        return self.api_key.strip()

    def _build_url(self, offset: int = 0, limit: int = 1000, filters: Optional[Dict[str, str]] = None) -> str:
        """Construct full request URL with query parameters and filters."""
        import urllib.parse
        key = self._require_api_key()
        params: Dict[str, Any] = {
            "api-key": key,
            "format": "json",
            "offset": offset,
            "limit": limit
        }
        if filters:
            for field, val in filters.items():
                if val:
                    params[f"filters[{field}]"] = val.strip()

        return f"{self.endpoint}?{urllib.parse.urlencode(params)}"

    def _fetch_page(self, url: str) -> List[Dict[str, Any]]:
        """Fetch a single page of JSON records via HTTP GET."""
        import urllib.request
        import urllib.error

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "AgriSense-Market-Intelligence/1.0",
                "Accept": "application/json"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.load(resp)
                if not isinstance(data, dict):
                    raise MarketDataError(f"Unexpected API response type: {type(data)}")
                if "records" not in data:
                    raise MarketDataError("Invalid API response: missing 'records' list.")
                if not isinstance(data["records"], list):
                    raise MarketDataError("Invalid API response: 'records' must be a list.")
                return data["records"]
        except urllib.error.HTTPError as e:
            raise MarketDataError(f"Agmarknet API HTTP error {e.code}: {e.reason}")
        except urllib.error.URLError as e:
            raise MarketDataError(f"Agmarknet API network connection error: {e.reason}")
        except json.JSONDecodeError as e:
            raise MarketDataError(f"Failed to parse JSON response from Agmarknet API: {e}")

    def get_records(
        self,
        crop: Optional[str] = None,
        market: Optional[str] = None,
        state: Optional[str] = None,
        max_records: int = 1000
    ) -> List[NormalizedMarketRecord]:
        """
        Fetch matching records from the live API with pagination and normalize them.
        """
        import time

        filters: Dict[str, str] = {}
        if crop:
            filters["commodity"] = crop
        if market:
            filters["market"] = market
        if state:
            filters["state"] = state

        normalized_records: List[NormalizedMarketRecord] = []
        offset = 0

        while len(normalized_records) < max_records:
            page_limit = min(self.DEFAULT_LIMIT, max_records - len(normalized_records))
            url = self._build_url(offset=offset, limit=page_limit, filters=filters)
            raw_records = self._fetch_page(url)

            if not raw_records:
                break

            for raw in raw_records:
                try:
                    rec = NormalizedMarketRecord.validate_and_create(raw)
                    # Provider identity is authoritative; never trust response data to label itself.
                    rec.raw_source = "data.gov.in (live)"
                    normalized_records.append(rec)
                except MarketDataError:
                    # Skip individually malformed rows from live stream without failing entire batch
                    continue

            offset += len(raw_records)
            if len(raw_records) < page_limit:
                break
            time.sleep(self.REQUEST_DELAY_SEC)

        # Sort chronologically
        normalized_records.sort(key=lambda x: x.date)
        return normalized_records
