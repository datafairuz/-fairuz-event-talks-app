# BigQuery Release Notes Hub & Twitter Composer

A responsive and aesthetic web application built with **Python Flask** and **plain vanilla HTML, CSS, and JavaScript** that fetches, caches, and parses the official Google Cloud BigQuery release notes. It separates combined daily release notes into distinct, individual updates so you can customize and tweet them on X (Twitter) via an interactive composer sidebar with live mockup previews.

---

## 🚀 Key Features

* **Smart Atom Feed Parser**: Fetches the official [BigQuery Release Notes Feed](https://docs.cloud.google.com/feeds/bigquery-release-notes.xml) and splits daily entries by `<h3>` tags (e.g., *Feature, Changed, Deprecated, Issue*) into distinct, individual release items.
* **On-Demand Refresh & Caching**: Includes a loading spinner that spins during requests. Uses a smart 1-hour server-side cache (`notes_cache.json`) to prevent hitting rate limits and speed up page load.
* **Dynamic Search & Filtering**: Instant client-side search by keywords and type filters (Features, Changed, Deprecated, Issues) with dynamic item counts.
* **Interactive X / Twitter Composer Sidebar**:
  * **Interactive Selection**: Selecting any update card in the feed automatically loads it into the composer.
  * **Automatic Truncation**: Intelligently compiles a default tweet template that fits within X's 280-character limit, accounting for header formats and links.
  * **Live Tweet Preview Mockup**: A pixel-perfect preview showing exactly how the tweet will look when posted, updating in real time as you edit.
  * **Circular Progress Ring**: A radial character counter that changes color (Blue ➔ Orange ➔ Red) and warns you when you exceed the 280-character boundary.
  * **Text Editor Controls**: Quick-actions to reset your draft to the default template or append the official document link.
* **X / Twitter Web Intent Sharing**: Opens the official X share panel in a separate window prefilled with your custom draft.
* **Local Share Log**: Logs the tweets you share in a local history file (`tweet_history.json`), which you can browse on the "Shared Tweets" tab and quickly repost at any time.

---

## 📁 Project Structure

* **`app.py`**: Flask server handling feed parsing, caching, and local tweet logs.
* **`templates/index.html`**: Structure of the single-page application.
* **`static/css/style.css`**: Styling sheets leveraging modern dark-mode, glassmorphism, and responsive grids.
* **`static/js/app.js`**: Core frontend controller dealing with state management, rendering, and API communication.
* **`.gitignore`**: Excludes local environment configs and data logs.

---

## 🛠️ Installation & Setup

Follow these steps to run the application locally on your machine:

### 1. Clone the repository
```bash
git clone https://github.com/datafairuz/-fairuz-event-talks-app.git
cd -fairuz-event-talks-app
```

### 2. Create and activate a Virtual Environment
**On Windows:**
```powershell
python -m venv .venv
.venv\Scripts\activate
```

**On macOS/Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install flask requests
```

### 4. Run the Server
```bash
python app.py
```
Open your browser and navigate to **[http://localhost:5000](http://localhost:5000)**.
