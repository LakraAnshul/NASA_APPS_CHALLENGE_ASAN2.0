import rasterio
import matplotlib.pyplot as plt

# --- CONFIGURATION ---
# 1. Define the path to your GeoTIFF file
tiff_file_path = (
    r"./output/web/ndvi_geotiffs/NDVI_HLS.S30.T10SFE.2025088T185021.v2.0.tif"
)

# --- PROCESSING ---
try:
    # 2. Open the GeoTIFF file using rasterio
    with rasterio.open(tiff_file_path) as src:
        # 3. Read the first band of the image into a NumPy array
        # Your NDVI GeoTIFFs only have one band.
        ndvi_data = src.read(1)

        # Print some basic info to verify
        print(f"Image opened successfully!")
        print(f"Shape: {ndvi_data.shape}")
        print(f"Data type: {ndvi_data.dtype}")

        # --- VISUALIZATION ---
        # 4. Use matplotlib to display the data, just like with the .npy file
        plt.figure(figsize=(8, 8))
        im = plt.imshow(ndvi_data, cmap="RdYlGn", vmin=-1, vmax=1)

        # 5. Add a colorbar and title for context
        plt.colorbar(im, label="NDVI Value")
        plt.title("GeoTIFF NDVI Visualization")

        # 6. Show the plot
        plt.show()

except Exception as e:
    print(f"An error occurred: {e}")
