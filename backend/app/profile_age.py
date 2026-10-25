"""Expose completed years, never a public birth date."""
from datetime import date, datetime, timezone

def age_years(value,today=None):
    if not value:return None
    try:
        born=date.fromisoformat(value)
    except (ValueError,TypeError):return None
    today=today or datetime.now(timezone.utc).date()
    age=today.year-born.year-((today.month,today.day)<(born.month,born.day))
    return age if born<=today and 0<=age<=120 else None

def visible_age(target,viewer_id,private=False,following=False,blocked=False,staff=False):
    if staff or (target.id!=viewer_id and (blocked or (private and not following))):return None
    return age_years(getattr(target,'birth_date',None))
