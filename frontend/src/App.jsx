import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import parseGeoraster from "georaster";
import proj4 from "proj4";
import "leaflet/dist/leaflet.css";

function MapUpdater({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds);
    }
  }, [bounds, map]);
  return null;
}

const GeoTiffLayer = ({
  url,
  onBoundsChange,
  onLoadingChange,
  onStatsChange,
}) => {
  const [imageUrl, setImageUrl] = useState("");
  const [bounds, setBounds] = useState(null);

  useEffect(() => {
    if (!url) return;

    onLoadingChange(true);
    const FLASK_BASE_URL = "http://127.0.0.1:5000";
    const fullUrl = FLASK_BASE_URL + url;

    const fetchAndProcessTiff = async () => {
      try {
        const response = await fetch(fullUrl);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);

        const canvas = document.createElement("canvas");
        canvas.width = georaster.width;
        canvas.height = georaster.height;
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(
          georaster.width,
          georaster.height,
        );

        // georaster.values[0] is a 2D array structure - flatten it
        const pixelData2D = georaster.values[0];

        // Flatten the 2D array into a 1D array of all pixel values
        let pixelData = [];
        for (let row of pixelData2D) {
          for (let value of row) {
            pixelData.push(value);
          }
        }

        console.log(
          "Raw pixel data sample (first 100):",
          pixelData.slice(0, 100),
        );
        console.log(
          "Middle section sample:",
          pixelData.slice(
            Math.floor(pixelData.length / 2),
            Math.floor(pixelData.length / 2) + 100,
          ),
        );
        console.log("Total pixels:", pixelData.length);

        // Calculate min/max without spreading (to avoid "too many arguments" error)
        let rawMin = Infinity;
        let rawMax = -Infinity;
        let validCount = 0;

        for (let i = 0; i < pixelData.length; i++) {
          const v = pixelData[i];
          // Skip NoData values: NaN, null, undefined, -9999, exactly 0 or -0
          if (
            v !== null &&
            v !== undefined &&
            !isNaN(v) &&
            isFinite(v) &&
            v !== 0 && // Skip zero values (common NoData)
            v > -9999 &&
            v < 10000
          ) {
            validCount++;
            if (v < rawMin) rawMin = v;
            if (v > rawMax) rawMax = v;
          }
        }

        console.log("Valid pixel count:", validCount);
        console.log("Value range:", { rawMin, rawMax });

        if (validCount === 0 || !isFinite(rawMin) || !isFinite(rawMax)) {
          console.error("No valid pixel values found!");
          onLoadingChange(false);
          return;
        }

        // Detect if values are scaled (e.g., 0-10000 instead of -1 to 1)
        let scaleFactor = 1;
        if (rawMax > 1.5 || rawMin < -1.5) {
          scaleFactor = 10000;
          console.log(
            "Detected scaled values, applying scale factor:",
            scaleFactor,
          );
        }

        // Calculate statistics for valid values only
        let sum = 0;
        let count = 0;
        let minVal = Infinity;
        let maxVal = -Infinity;

        for (let i = 0; i < pixelData.length; i++) {
          const v = pixelData[i];
          if (
            v !== null &&
            v !== undefined &&
            !isNaN(v) &&
            isFinite(v) &&
            v !== 0 &&
            v > -9999 &&
            v < 10000
          ) {
            const normalized = v / scaleFactor;
            sum += normalized;
            count++;
            if (normalized < minVal) minVal = normalized;
            if (normalized > maxVal) maxVal = normalized;
          }
        }

        const avgVal = sum / count;
        console.log("Normalized stats:", {
          minVal,
          maxVal,
          avgVal,
          validPixels: count,
        });

        // Count pixels in each NDVI category
        let colorCounts = {
          water: 0, // < -0.2 (red)
          barren: 0, // -0.2 to 0.0 (orange)
          sparse: 0, // 0.0 to 0.2 (yellow)
          moderate: 0, // 0.2 to 0.5 (light green)
          dense: 0, // > 0.5 (dark green)
        };

        const ndviColorScale = (value) => {
          // Normalize the value if it's scaled
          const normalizedValue = value / scaleFactor;

          if (normalizedValue <= -0.2) {
            colorCounts.water++;
            return [215, 25, 28];
          }
          if (normalizedValue <= 0.0) {
            colorCounts.barren++;
            return [253, 174, 97];
          }
          if (normalizedValue <= 0.2) {
            colorCounts.sparse++;
            return [255, 255, 191];
          }
          if (normalizedValue <= 0.5) {
            colorCounts.moderate++;
            return [166, 217, 106];
          }
          colorCounts.dense++;
          return [26, 150, 65];
        };

        for (let i = 0; i < pixelData.length; i++) {
          const value = pixelData[i];

          // Skip NoData values
          if (
            value === null ||
            value === undefined ||
            isNaN(value) ||
            !isFinite(value) ||
            value <= -9999 ||
            value >= 10000
          ) {
            // Set NoData pixels to transparent or a neutral color
            imageData.data[i * 4] = 128;
            imageData.data[i * 4 + 1] = 128;
            imageData.data[i * 4 + 2] = 128;
            imageData.data[i * 4 + 3] = 0; // Transparent
            continue;
          }

          const [r, g, b] = ndviColorScale(value);
          imageData.data[i * 4] = r;
          imageData.data[i * 4 + 1] = g;
          imageData.data[i * 4 + 2] = b;
          imageData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);

        setImageUrl(canvas.toDataURL());

        const { xmin, ymin, xmax, ymax, projection } = georaster;

        console.log("=== RAW GEOTIFF BOUNDS FROM FILE ===");
        console.log("Projection EPSG:", projection);
        console.table({
          "xmin (West/Left)": xmin,
          "ymin (South/Bottom)": ymin,
          "xmax (East/Right)": xmax,
          "ymax (North/Top)": ymax,
        });

        if (!xmin || !ymin || !xmax || !ymax) {
          console.error("Invalid bounds in GeoTIFF!");
          onLoadingChange(false);
          return;
        }

        let newBounds;
        let cornerCoords = {};

        if (projection && projection !== 4326) {
          const utmProj = `EPSG:${projection}`;
          const wgs84 = "EPSG:4326";

          console.log(`Converting from ${utmProj} to ${wgs84}...`);

          const [minLng, minLat] = proj4(utmProj, wgs84, [xmin, ymin]);
          const [maxLng, maxLat] = proj4(utmProj, wgs84, [xmax, ymax]);

          console.log("=== REPROJECTED TO WGS84 (Lat/Lng) ===");
          console.table({
            "SW Corner": `${minLat.toFixed(6)}, ${minLng.toFixed(6)}`,
            "NE Corner": `${maxLat.toFixed(6)}, ${maxLng.toFixed(6)}`,
            "SE Corner": `${minLat.toFixed(6)}, ${maxLng.toFixed(6)}`,
            "NW Corner": `${maxLat.toFixed(6)}, ${minLng.toFixed(6)}`,
          });

          newBounds = new LatLngBounds([minLat, minLng], [maxLat, maxLng]);
          cornerCoords = {
            southWest: { lat: minLat, lng: minLng },
            northEast: { lat: maxLat, lng: maxLng },
            southEast: { lat: minLat, lng: maxLng },
            northWest: { lat: maxLat, lng: minLng },
          };
        } else {
          console.log("Already in WGS84, no reprojection needed");
          newBounds = new LatLngBounds([ymin, xmin], [ymax, xmax]);
          cornerCoords = {
            southWest: { lat: ymin, lng: xmin },
            northEast: { lat: ymax, lng: xmax },
            southEast: { lat: ymin, lng: xmax },
            northWest: { lat: ymax, lng: xmin },
          };
        }

        // Calculate area (approximate, using Haversine formula)
        const R = 6371; // Earth's radius in km
        const latDiff =
          ((cornerCoords.northEast.lat - cornerCoords.southWest.lat) *
            Math.PI) /
          180;
        const lngDiff =
          ((cornerCoords.northEast.lng - cornerCoords.southWest.lng) *
            Math.PI) /
          180;
        const avgLat =
          (((cornerCoords.northEast.lat + cornerCoords.southWest.lat) / 2) *
            Math.PI) /
          180;

        const width = R * lngDiff * Math.cos(avgLat);
        const height = R * latDiff;
        const areaKm2 = Math.abs(width * height);

        // Calculate percentages
        const totalPixels = count; // Use valid pixel count, not all pixels
        const colorPercentages = {
          water: ((colorCounts.water / totalPixels) * 100).toFixed(1),
          barren: ((colorCounts.barren / totalPixels) * 100).toFixed(1),
          sparse: ((colorCounts.sparse / totalPixels) * 100).toFixed(1),
          moderate: ((colorCounts.moderate / totalPixels) * 100).toFixed(1),
          dense: ((colorCounts.dense / totalPixels) * 100).toFixed(1),
        };

        console.log("Setting bounds for ImageOverlay:", {
          southWest: newBounds.getSouthWest(),
          northEast: newBounds.getNorthEast(),
        });

        setBounds(newBounds);
        onBoundsChange(newBounds);

        // Detailed console logging
        console.group(`📊 NDVI Data Analysis - ${url}`);
        console.log("🗺️  Geographic Information:");
        console.table({
          Projection: `EPSG:${projection}`,
          "Image Dimensions": `${georaster.width} × ${georaster.height} pixels`,
          "Area Coverage": `${areaKm2.toFixed(2)} km²`,
        });

        console.log("\n📍 Corner Coordinates (WGS84):");
        console.table(cornerCoords);

        console.log("\n📈 NDVI Statistics:");
        console.table({
          "Minimum NDVI": minVal.toFixed(3),
          "Maximum NDVI": maxVal.toFixed(3),
          "Average NDVI": avgVal.toFixed(3),
          "Valid Pixels": count.toLocaleString(),
          "Total Pixels": pixelData.length.toLocaleString(),
        });

        console.log("\n🎨 Vegetation Distribution:");
        console.table({
          "Water/Clouds (< -0.2)": `${colorPercentages.water}% (${colorCounts.water.toLocaleString()} pixels)`,
          "Barren (-0.2 to 0.0)": `${colorPercentages.barren}% (${colorCounts.barren.toLocaleString()} pixels)`,
          "Sparse (0.0 to 0.2)": `${colorPercentages.sparse}% (${colorCounts.sparse.toLocaleString()} pixels)`,
          "Moderate (0.2 to 0.5)": `${colorPercentages.moderate}% (${colorCounts.moderate.toLocaleString()} pixels)`,
          "Dense (> 0.5)": `${colorPercentages.dense}% (${colorCounts.dense.toLocaleString()} pixels)`,
        });
        console.groupEnd();

        // Send statistics to parent
        onStatsChange({
          min: minVal.toFixed(3),
          max: maxVal.toFixed(3),
          avg: avgVal.toFixed(3),
          width: georaster.width,
          height: georaster.height,
          projection: projection,
          area: areaKm2.toFixed(2),
          coordinates: cornerCoords,
          colorPercentages: colorPercentages,
          colorCounts: colorCounts,
          totalPixels: count, // Use valid pixel count
        });

        onLoadingChange(false);
      } catch (error) {
        console.error("Error processing GeoTIFF:", error);
        onLoadingChange(false);
      }
    };
    fetchAndProcessTiff();
  }, [url, onBoundsChange, onLoadingChange, onStatsChange]);

  if (!imageUrl || !bounds) return null;

  return <ImageOverlay url={imageUrl} bounds={bounds} opacity={0.75} />;
};

function App() {
  const [tiffFiles, setTiffFiles] = useState([]);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [currentBounds, setCurrentBounds] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/geotiffs")
      .then((res) => res.json())
      .then((data) => setTiffFiles(data))
      .catch((err) => console.error("Failed to fetch TIFF list:", err));
  }, []);

  const currentTiff = tiffFiles[sliderIndex];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: "#f5f5f5",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "15px 20px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.8em", fontWeight: "600" }}>
          🌿 California NDVI Viewer
        </h1>
        <p style={{ margin: "5px 0 0 0", opacity: 0.9, fontSize: "0.9em" }}>
          Normalized Difference Vegetation Index - Track vegetation health over
          time
        </p>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Map Container */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {isLoading && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 1000,
                background: "rgba(255, 255, 255, 0.95)",
                padding: "30px 40px",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  border: "4px solid #f3f3f3",
                  borderTop: "4px solid #667eea",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 15px",
                }}
              ></div>
              <p style={{ margin: 0, fontSize: "1.1em", color: "#333" }}>
                Loading NDVI data...
              </p>
            </div>
          )}

          <MapContainer
            center={[36.77, -119.41]}
            zoom={6}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {currentTiff && (
              <GeoTiffLayer
                url={currentTiff.path}
                onBoundsChange={setCurrentBounds}
                onLoadingChange={setIsLoading}
                onStatsChange={setStats}
              />
            )}
            <MapUpdater bounds={currentBounds} />
          </MapContainer>
        </div>

        {/* Side Panel */}
        <div
          style={{
            width: "380px",
            flexShrink: 0,
            background: "white",
            padding: "20px",
            overflowY: "auto",
            boxShadow: "-2px 0 10px rgba(0,0,0,0.1)",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#333", fontSize: "1.2em" }}>
            📊 Data Controls
          </h3>

          {tiffFiles.length > 0 ? (
            <>
              <div
                style={{
                  background: "#f8f9fa",
                  padding: "15px",
                  borderRadius: "8px",
                  marginBottom: "15px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    marginBottom: "10px",
                    fontWeight: "600",
                    color: "#555",
                    fontSize: "0.95em",
                  }}
                >
                  Select Time Period
                </label>
                <input
                  type="range"
                  min="0"
                  max={tiffFiles.length - 1}
                  value={sliderIndex}
                  onChange={(e) => setSliderIndex(Number(e.target.value))}
                  style={{
                    width: "100%",
                    accentColor: "#667eea",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "5px",
                    fontSize: "0.85em",
                    color: "#666",
                  }}
                >
                  <span>
                    Image {sliderIndex + 1} of {tiffFiles.length}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: "#e8f5e9",
                  padding: "12px",
                  borderRadius: "8px",
                  marginBottom: "15px",
                  border: "1px solid #c8e6c9",
                }}
              >
                <strong style={{ color: "#2e7d32", fontSize: "0.9em" }}>
                  📅 Current Image:
                </strong>
                <p
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "0.95em",
                    color: "#333",
                  }}
                >
                  {currentTiff?.label}
                </p>
              </div>

              {stats && (
                <>
                  <div
                    style={{
                      background: "#fff3e0",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #ffe0b2",
                      marginBottom: "15px",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 10px 0",
                        color: "#e65100",
                        fontSize: "1em",
                      }}
                    >
                      📈 Statistics
                    </h4>
                    <div style={{ fontSize: "0.88em", lineHeight: "1.6" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Min NDVI:</span>
                        <strong style={{ color: "#d32f2f" }}>
                          {stats.min}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Max NDVI:</span>
                        <strong style={{ color: "#388e3c" }}>
                          {stats.max}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Average NDVI:</span>
                        <strong style={{ color: "#1976d2" }}>
                          {stats.avg}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#e3f2fd",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #bbdefb",
                      marginBottom: "15px",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 10px 0",
                        color: "#1565c0",
                        fontSize: "1em",
                      }}
                    >
                      🗺️ Coverage Area
                    </h4>
                    <div style={{ fontSize: "0.88em", lineHeight: "1.6" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Area:</span>
                        <strong style={{ color: "#666" }}>
                          {stats.area} km²
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Dimensions:</span>
                        <strong style={{ color: "#666" }}>
                          {stats.width} × {stats.height}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "#666" }}>Projection:</span>
                        <strong style={{ color: "#666" }}>
                          EPSG:{stats.projection}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fce4ec",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #f8bbd0",
                      marginBottom: "15px",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 10px 0",
                        color: "#c2185b",
                        fontSize: "1em",
                      }}
                    >
                      📍 Coordinates
                    </h4>
                    <div
                      style={{
                        fontSize: "0.8em",
                        lineHeight: "1.5",
                        color: "#555",
                      }}
                    >
                      <div style={{ marginBottom: "5px" }}>
                        <strong>SW:</strong>{" "}
                        {stats.coordinates?.southWest.lat.toFixed(4)}°,{" "}
                        {stats.coordinates?.southWest.lng.toFixed(4)}°
                      </div>
                      <div style={{ marginBottom: "5px" }}>
                        <strong>NE:</strong>{" "}
                        {stats.coordinates?.northEast.lat.toFixed(4)}°,{" "}
                        {stats.coordinates?.northEast.lng.toFixed(4)}°
                      </div>
                      <div style={{ marginBottom: "5px" }}>
                        <strong>SE:</strong>{" "}
                        {stats.coordinates?.southEast.lat.toFixed(4)}°,{" "}
                        {stats.coordinates?.southEast.lng.toFixed(4)}°
                      </div>
                      <div>
                        <strong>NW:</strong>{" "}
                        {stats.coordinates?.northWest.lat.toFixed(4)}°,{" "}
                        {stats.coordinates?.northWest.lng.toFixed(4)}°
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#f3e5f5",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #e1bee7",
                      marginBottom: "15px",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 10px 0",
                        color: "#7b1fa2",
                        fontSize: "1em",
                      }}
                    >
                      📊 Distribution
                    </h4>
                    <div style={{ fontSize: "0.85em", lineHeight: "1.7" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "5px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              background: "rgb(26, 150, 65)",
                              borderRadius: "3px",
                            }}
                          ></div>
                          <span style={{ color: "#555" }}>Dense</span>
                        </div>
                        <strong style={{ color: "#666" }}>
                          {stats.colorPercentages?.dense}%
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "5px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              background: "rgb(166, 217, 106)",
                              borderRadius: "3px",
                            }}
                          ></div>
                          <span style={{ color: "#555" }}>Moderate</span>
                        </div>
                        <strong style={{ color: "#666" }}>
                          {stats.colorPercentages?.moderate}%
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "5px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              background: "rgb(255, 255, 191)",
                              borderRadius: "3px",
                            }}
                          ></div>
                          <span style={{ color: "#555" }}>Sparse</span>
                        </div>
                        <strong style={{ color: "#666" }}>
                          {stats.colorPercentages?.sparse}%
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "5px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              background: "rgb(253, 174, 97)",
                              borderRadius: "3px",
                            }}
                          ></div>
                          <span style={{ color: "#555" }}>Barren</span>
                        </div>
                        <strong style={{ color: "#666" }}>
                          {stats.colorPercentages?.barren}%
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              background: "rgb(215, 25, 28)",
                              borderRadius: "3px",
                            }}
                          ></div>
                          <span style={{ color: "#555" }}>Water</span>
                        </div>
                        <strong style={{ color: "#666" }}>
                          {stats.colorPercentages?.water}%
                        </strong>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div
                style={{
                  marginTop: "15px",
                  padding: "12px",
                  background: "#f5f5f5",
                  borderRadius: "8px",
                  fontSize: "0.85em",
                  color: "#666",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 8px 0",
                    color: "#333",
                    fontSize: "0.95em",
                  }}
                >
                  🎨 Legend
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        background: "rgb(26, 150, 65)",
                        borderRadius: "3px",
                      }}
                    ></div>
                    <span>&gt; 0.5 Dense</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        background: "rgb(166, 217, 106)",
                        borderRadius: "3px",
                      }}
                    ></div>
                    <span>0.2-0.5 Moderate</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        background: "rgb(255, 255, 191)",
                        borderRadius: "3px",
                      }}
                    ></div>
                    <span>0.0-0.2 Sparse</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        background: "rgb(253, 174, 97)",
                        borderRadius: "3px",
                      }}
                    ></div>
                    <span>-0.2-0.0 Barren</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        background: "rgb(215, 25, 28)",
                        borderRadius: "3px",
                      }}
                    ></div>
                    <span>&lt; -0.2 Water</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{ textAlign: "center", padding: "20px", color: "#666" }}
            >
              <p>Loading available images...</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        body, #root {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
}

export default App;
