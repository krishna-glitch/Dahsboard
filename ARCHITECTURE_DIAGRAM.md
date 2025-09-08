# Environmental Monitoring System

```
╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                    🌊 ENVIRONMENTAL MONITORING SYSTEM                                    ║
║                                          Complete System Overview                                        ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝

                                   👥 USERS & STAKEHOLDERS
                      ┌─────────────────────────────────────────────────────────┐
                      │  🔬 Scientists    🏭 Engineers    📊 Analysts    👨‍💼 Managers  │
                      └─────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼

    ╔════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║                                    🖥️ WEB APPLICATION                                                ║
    ║                                 (What Users See & Use)                                             ║
    ╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
    ║                                                                                                    ║
    ║  🏠 DASHBOARD HOME                              📊 ANALYSIS PAGES                                  ║
    ║  ┌─────────────────────────┐                   ┌──────────────────────────────┐                  ║
    ║  │ 📈 Live KPI Cards       │                   │ 💧 Water Quality Analysis    │                  ║
    ║  │ • Active Sites          │                   │ • Temperature (°C)           │                  ║
    ║  │ • Recent Readings       │        ┌─────────▶│ • Conductivity (μS/cm)       │                  ║
    ║  │ • Data Quality %        │        │          │ • Water Level (m)            │                  ║
    ║  │ • Active Alerts         │        │          │ • Plotly Time Series Charts  │                  ║
    ║  │ • Latest WQ Records     │        │          │ • Export Excel/CSV/PNG       │                  ║
    ║  │ • Latest Redox Records  │        │          └──────────────────────────────┘                  ║
    ║  └─────────────────────────┘        │                                                             ║
    ║                                     │          ┌──────────────────────────────┐                  ║
    ║  🎯 NAVIGATION CARDS               │          │ 🧪 Redox Analysis            │                  ║
    ║  ┌─────────────────────────┐        │          │ • Time Series View           │                  ║
    ║  │ Water Quality ──────────┼────────┘          │ • Depth vs Redox Snapshot    │                  ║
    ║  │ Redox Analysis ─────────┼────────────────────▶ • 24H Rolling Window       │                  ║
    ║  │ Site Comparison ────────┼────────┐          │ • Zones & Heatmap Views     │                  ║
    ║  │ Data Quality ───────────┼─────┐  │          │ • DeckGL High-Performance    │                  ║
    ║  │ Alerts & Reports ───────┼───┐ │  │          │ • Statistical Analysis       │                  ║
    ║  └─────────────────────────┘   │ │  │          └──────────────────────────────┘                  ║
    ║                                │ │  │                                                             ║
    ║  📋 QUICK ACCESS               │ │  │          ┌──────────────────────────────┐                  ║
    ║  ┌─────────────────────────┐    │ │  └──────────▶ ⚖️ Site Comparison            │                  ║
    ║  │ Upload Data             │    │ │             │ • Water Quality vs Redox     │                  ║
    ║  │ System Health (Admin)   │    │ │             │ • Temperature/Conductivity   │                  ║
    ║  │ Performance (Admin)     │    │ │             │ • Concurrent vs Full Period  │                  ║
    ║  │ Data Diagnostics (Admin)│    │ │             │ • Overlay & Per-Site Charts  │                  ║
    ║  │ Data Quality Tools      │    │ │             │ • Correlation Analysis       │                  ║
    ║  └─────────────────────────┘    │ │             └──────────────────────────────┘                  ║
    ║                                │ │                                                               ║
    ║                                │ └─────────────▶ ✅ Data Quality Control      │                  ║
    ║                                │               │ • Completeness Heatmaps      │                  ║
    ║                                │               │ • TanStack Duplicate Viewer  │                  ║
    ║                                │               │ • Outlier & Flatline Detect  │                  ║
    ║                                │               │ • Daily Quality Metrics      │                  ║
    ║                                │               │ • Custom Date Range Support  │                  ║
    ║                                │               └──────────────────────────────┘                  ║
    ║                                │                                                                 ║
    ║                                └─────────────────▶ 📤 System Utilities         │                  ║
    ║                                                 │ • File Upload with History   │                  ║
    ║                                                 │ • Alert Management System    │                  ║
    ║                                                 │ • Admin Tools (Restricted)   │                  ║
    ║                                                 │   - Performance Monitoring   │                  ║
    ║                                                 │   - System Health Checks     │                  ║
    ║                                                 │   - Data Diagnostics         │                  ║
    ║                                                 └──────────────────────────────┘                  ║
    ╚════════════════════════════════════════════════════════════════════════════════════════════════════╝
                                                      │
                                         📡 Data Requests
                                                      ▼

    ╔════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║                                  🔧 APPLICATION ENGINE                                               ║
    ║                              (Behind the Scenes Processing)                                         ║
    ╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
    ║                                                                                                    ║
    ║  🛡️ SECURITY & AUTHENTICATION         ⚡ PERFORMANCE OPTIMIZATION                                  ║
    ║  • User Login/Logout                  • Smart Caching (200x faster)                              ║
    ║  • Session Management                 • Data Compression                                          ║
    ║  • Access Control                     • Response Optimization                                     ║
    ║                                                                                                    ║
    ║  🔄 DATA PROCESSING                    📊 ANALYSIS ENGINES                                         ║
    ║  • Real-time Calculations             • Statistical Analysis                                       ║
    ║  • Quality Validation                 • Trend Detection                                           ║
    ║  • Format Conversion                  • Correlation Analysis                                       ║
    ║  • Export Generation                  • Geochemical Classification                                ║
    ╚════════════════════════════════════════════════════════════════════════════════════════════════════╝
                                                      │
                                            🗃️ Data Storage
                                                      ▼

    ╔════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║                                    🗄️ DATA WAREHOUSE                                                ║
    ║                                (Amazon Redshift Database)                                          ║
    ╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
    ║                                                                                                    ║
    ║  📋 MEASUREMENT DATA                   🏢 SITE INFORMATION                                          ║
    ║  ┌─────────────────────────┐          ┌─────────────────────────┐                                 ║
    ║  │ 🌡️ Temperature (°C)     │          │ 📍 Sites S1, S2, S3, S4 │                                 ║
    ║  │ ⚡ Conductivity (μS/cm) │          │ 🎯 Multi-depth Monitoring│                                 ║
    ║  │ 💧 Water Level (m)      │          │ 📏 Depth 10-200cm Range │                                 ║
    ║  │ 🧪 Redox Potential (mV) │          │ 🕐 15min/1H Intervals    │                                 ║
    ║  └─────────────────────────┘          │ 📊 Materialized Views    │                                 ║
    ║                                       └─────────────────────────┘                                 ║
    ║                                                                                                    ║
    ║  📈 PROCESSED VIEWS                    🔍 QUALITY CONTROL                                          ║
    ║  • Hourly Aggregations                • Data Validation Rules                                     ║
    ║  • Daily Summaries                    • Outlier Detection                                         ║
    ║  • Site Comparisons                   • Completeness Checks                                       ║
    ║  • Trend Analysis                     • Duplicate Prevention                                       ║
    ╚════════════════════════════════════════════════════════════════════════════════════════════════════╝


╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                      🚀 USER JOURNEY FLOW                                                ║
╠══════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                          ║
║   1️⃣ LOGIN           2️⃣ DASHBOARD          3️⃣ CHOOSE ANALYSIS         4️⃣ VIEW RESULTS                ║
║   ┌─────────┐       ┌─────────┐           ┌─────────────────┐       ┌─────────────────┐                ║
║   │ 👤 User │  →    │ 📊 Live │     →     │ 🎯 Select:      │  →    │ 📈 Plotly Charts│                ║
║   │ Login   │       │ KPI Cards│           │ • Sites S1-S4   │       │ • Time Series   │                ║
║   └─────────┘       └─────────┘           │ • 7d/30d/90d    │       │ • Depth Profiles │                ║
║                                           │ • Temp/Cond/Eh  │       │ • Rolling Windows│                ║
║                                           └─────────────────┘       └─────────────────┘                ║
║                                                                                                          ║
║   5️⃣ REDOX ANALYSIS          6️⃣ EXPORT DATA           7️⃣ DATA QUALITY                                 ║
║   ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐                              ║
║   │ 🧪 Redox Views: │  →    │ 💾 Download:    │  →    │ ✅ Check:       │                              ║
║   │ • Time Series   │       │ • Excel Files   │       │ • Completeness % │                              ║
║   │ • Depth Snapshot│       │ • PNG Charts    │       │ • Duplicate Table│                              ║
║   │ • 24H Rolling   │       │ • CSV Raw Data  │       │ • Outlier Points │                              ║
║   │ • Zones/Heatmap │       │ • Plotly Charts │       │ • Missing Data   │                              ║
║   └─────────────────┘       └─────────────────┘       └─────────────────┘                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝


```