import os
import json
import re
import html
import requests
import datetime
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# File paths for caching and history
CACHE_FILE = "notes_cache.json"
HISTORY_FILE = "tweet_history.json"
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_to_text(html_content):
    """Strip HTML tags and decode entities to create clean plain text."""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', html_content)
    # Decode HTML entities
    text = html.unescape(text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_feed_content(xml_content):
    """Parse the Atom feed XML and extract release note items."""
    import xml.etree.ElementTree as ET
    
    root = ET.fromstring(xml_content)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('atom:entry', ns)
    
    parsed_items = []
    for entry in entries:
        entry_id_elm = entry.find('atom:id', ns)
        entry_id = entry_id_elm.text if entry_id_elm is not None else "unknown_id"
        
        date_elm = entry.find('atom:title', ns)
        date_str = date_elm.text if date_elm is not None else "Unknown Date"
        
        updated_elm = entry.find('atom:updated', ns)
        updated_str = updated_elm.text if updated_elm is not None else datetime.datetime.now().isoformat()
        
        content_elm = entry.find('atom:content', ns)
        if content_elm is None or not content_elm.text:
            continue
            
        content_html = content_elm.text
        
        # Split by h3 to separate individual updates for the day
        parts = re.split(r'(<h3>.*?</h3>)', content_html)
        current_type = None
        current_text_html = ""
        temp_items = []
        
        for part in parts:
            if not part:
                continue
            if part.startswith("<h3>") and part.endswith("</h3>"):
                if current_type and current_text_html:
                    temp_items.append((current_type, current_text_html))
                current_type = part.replace("<h3>", "").replace("</h3>", "").strip()
                current_text_html = ""
            else:
                current_text_html += part
                
        if current_type and current_text_html:
            temp_items.append((current_type, current_text_html))
            
        # Fallback if no <h3> tags were found
        if not temp_items:
            plain_text = clean_html_to_text(content_html)
            link_match = re.search(r'href="([^"]+)"', content_html)
            first_link = link_match.group(1) if link_match else "https://cloud.google.com/bigquery/docs/release-notes"
            
            parsed_items.append({
                "id": f"{entry_id}_0",
                "date": date_str,
                "updated": updated_str,
                "type": "Update",
                "content_html": content_html.strip(),
                "content_text": plain_text,
                "link": first_link
            })
        else:
            for idx, (utype, uhtml) in enumerate(temp_items):
                link_match = re.search(r'href="([^"]+)"', uhtml)
                first_link = link_match.group(1) if link_match else "https://cloud.google.com/bigquery/docs/release-notes"
                
                plain_text = clean_html_to_text(uhtml)
                
                parsed_items.append({
                    "id": f"{entry_id}_{idx}",
                    "date": date_str,
                    "updated": updated_str,
                    "type": utype,
                    "content_html": uhtml.strip(),
                    "content_text": plain_text,
                    "link": first_link
                })
                
    return parsed_items

def get_notes(force_refresh=False):
    """Retrieve release notes from cache or fetch from source if needed."""
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
                # Ensure cache is not older than 1 hour (3600 seconds)
                cached_time = datetime.datetime.fromisoformat(cache_data.get("fetched_at", ""))
                time_diff = datetime.datetime.now() - cached_time
                if time_diff.total_seconds() < 3600:
                    return cache_data.get("items", []), cached_time.isoformat(), False
        except Exception:
            pass # Fallback to fetch if cache read fails
            
    # Fetch from live feed
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        items = parse_feed_content(response.content)
        
        # Save to cache
        fetched_at = datetime.datetime.now().isoformat()
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "fetched_at": fetched_at,
                "items": items
            }, f, indent=2, ensure_ascii=False)
            
        return items, fetched_at, True
    except Exception as e:
        # If fetch fails, try to return expired cache as fallback
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                    return cache_data.get("items", []), cache_data.get("fetched_at", ""), False
            except Exception:
                pass
        raise e

def load_tweet_history():
    """Load logged tweets from JSON."""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_tweet_history(history):
    """Save logged tweets to JSON."""
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes', methods=['GET'])
def api_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        items, fetched_at, is_fresh = get_notes(force_refresh=force_refresh)
        return jsonify({
            "success": True,
            "fetched_at": fetched_at,
            "is_fresh": is_fresh,
            "count": len(items),
            "items": items
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/tweets', methods=['GET', 'POST'])
def api_tweets():
    if request.method == 'POST':
        data = request.json or {}
        text = data.get('text')
        note_id = data.get('note_id')
        note_title = data.get('note_title')
        
        if not text:
            return jsonify({"success": False, "error": "Tweet text is required"}), 400
            
        history = load_tweet_history()
        new_tweet = {
            "id": f"tweet_{int(datetime.datetime.now().timestamp() * 1000)}",
            "timestamp": datetime.datetime.now().isoformat(),
            "text": text,
            "note_id": note_id,
            "note_title": note_title
        }
        history.insert(0, new_tweet)  # Add to top (newest first)
        # Limit history to 50 items
        history = history[:50]
        save_tweet_history(history)
        return jsonify({"success": True, "tweet": new_tweet})
    else:
        history = load_tweet_history()
        return jsonify(history)

if __name__ == '__main__':
    # Bind to localhost:5000
    app.run(debug=True, port=5000)
