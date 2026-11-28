from pathlib import Path
import xml.etree.ElementTree as ET
import pytest
from backend.app.welcome_cosmetics import catalog

ROOT = Path(__file__).resolve().parents[2]
NS = "{http://www.w3.org/2000/svg}"

@pytest.mark.parametrize("item", catalog(), ids=lambda x: x["asset_key"])
def test_welcome_preview_asset(item):
    assert item["preview_asset"] == "welcome-premium-v3/" + item["asset_key"] + ".svg"
    assert item["preview_ready"] is True
    assert item["artwork_ready"] is False  # production equip/delivery not integrated
    path = ROOT / "frontend" / item["preview_asset"]
    root = ET.parse(path).getroot()
    assert root.tag == NS + "svg"
    assert root.get("viewBox")
    assert not any(e.tag in (NS+"script", NS+"foreignObject") for e in root.iter())
    assert bool(root.findall(".//" + NS + "animateTransform")) == item["animated"]
    assert item["exclusive"] and not item["shop_available"]
