import os
import re
from flask import Flask, jsonify
from flask_cors import CORS  # Import CORS

# --- Basic Setup ---
app = Flask(__name__, static_url_path="/static", static_folder="output/web")

# --- Enable CORS ---
# This allows your React frontend (on a different port) to fetch data from this server.
CORS(app)


# --- API Endpoint ---
@app.route("/api/geotiffs")
def list_geotiffs():
    """API endpoint to get a list of available NDVI files."""
    try:
        geotiff_dir = os.path.join("output", "web", "ndvi_geotiffs")

        available_files = sorted(
            [
                f
                for f in os.listdir(geotiff_dir)
                if f.startswith("NDVI_") and f.endswith(".tif")
            ]
        )

        # Create a list of dictionaries with file paths and labels
        file_info = []
        for f in available_files:
            label = f  # Default label is the filename
            match = re.search(r"NDVI_HLS\.S30\.(T\w+)\.(\d{7})T", f)
            if match:
                label = f"{match.group(1)} on {match.group(2)}"

            file_info.append({"path": f"/static/ndvi_geotiffs/{f}", "label": label})

        return jsonify(file_info)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
