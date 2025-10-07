"""
HLS Sentinel-2 Data Downloader for NASA Earthdata
Downloads HLS S30 v2.0 data for specified region and date range
"""

import requests
from pathlib import Path
import getpass
from datetime import datetime, timedelta
import time

class HLSDownloader:
    def __init__(self, username=None, password=None):
        """
        Initialize HLS downloader
        
        Args:
            username: Earthdata login username
            password: Earthdata login password
        """
        self.base_url = "https://cmr.earthdata.nasa.gov/search/granules.json"
        self.download_url = "https://data.lpdaac.earthdatacloud.nasa.gov"
        
        # Get credentials
        if not username:
            print("Enter your NASA Earthdata credentials:")
            print("(Sign up at: https://urs.earthdata.nasa.gov/users/new)")
            username = input("Username: ")
        
        if not password:
            password = getpass.getpass("Password: ")
        
        self.session = requests.Session()
        self.session.auth = (username, password)
        
    def search_granules(self, tile_id, start_date, end_date, bands=None):
        """
        Search for HLS granules
        
        Args:
            tile_id: MGRS tile ID (e.g., 'T11SLS')
            start_date: Start date string 'YYYY-MM-DD'
            end_date: End date string 'YYYY-MM-DD'
            bands: List of bands to download (e.g., ['B04', 'B8A', 'Fmask'])
        
        Returns:
            List of granule URLs
        """
        if bands is None:
            bands = ['B04', 'B8A', 'Fmask']  # Red, NIR, Cloud mask
        
        params = {
            'short_name': 'HLSS30',
            'version': '2.0',
            'temporal': f"{start_date}T00:00:00Z,{end_date}T23:59:59Z",
            'page_size': 2000,
        }
        
        print(f"\nSearching for HLS data:")
        print(f"  Tile: {tile_id}")
        print(f"  Date range: {start_date} to {end_date}")
        print(f"  Bands: {', '.join(bands)}")
        
        response = self.session.get(self.base_url, params=params)
        
        if response.status_code != 200:
            print(f"Error searching: {response.status_code}")
            return []
        
        granules = response.json()['feed']['entry']
        
        # Filter by tile and bands
        filtered_urls = []
        
        for granule in granules:
            granule_id = granule['title']
            
            # Check if granule matches our tile
            if tile_id not in granule_id:
                continue
            
            # Get download links
            if 'links' in granule:
                for link in granule['links']:
                    if link['rel'] == 'http://esipfed.org/ns/fedsearch/1.1/data#':
                        url = link['href']
                        
                        # Filter by requested bands
                        for band in bands:
                            if f".{band}.tif" in url:
                                filtered_urls.append(url)
        
        print(f"\nFound {len(filtered_urls)} files to download")
        return filtered_urls
    
    def download_file(self, url, output_dir):
        """Download a single file"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        filename = url.split('/')[-1]
        filepath = output_path / filename
        
        # Skip if already downloaded
        if filepath.exists():
            print(f"  ✓ Already exists: {filename}")
            return True
        
        try:
            print(f"  ⬇ Downloading: {filename}")
            
            response = self.session.get(url, stream=True)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            
            with open(filepath, 'wb') as f:
                downloaded = 0
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        # Progress indicator
                        if total_size > 0:
                            percent = (downloaded / total_size) * 100
                            print(f"    Progress: {percent:.1f}%", end='\r')
            
            print(f"  ✓ Downloaded: {filename} ({total_size/1024/1024:.1f} MB)")
            return True
            
        except Exception as e:
            print(f"  ✗ Error downloading {filename}: {e}")
            if filepath.exists():
                filepath.unlink()  # Remove partial download
            return False
    
    def download_dataset(self, tile_id, start_date, end_date, 
                        output_dir='hls_data', bands=None, max_files=None):
        """
        Download complete HLS dataset
        
        Args:
            tile_id: MGRS tile ID
            start_date: Start date 'YYYY-MM-DD'
            end_date: End date 'YYYY-MM-DD'
            output_dir: Output directory
            bands: List of bands to download
            max_files: Maximum files to download (for testing)
        """
        print("="*70)
        print("HLS SENTINEL-2 DATA DOWNLOADER")
        print("="*70)
        
        # Search for granules
        urls = self.search_granules(tile_id, start_date, end_date, bands)
        
        if not urls:
            print("No granules found!")
            return
        
        if max_files:
            urls = urls[:max_files]
            print(f"\nLimiting to first {max_files} files for testing")
        
        # Download files
        print(f"\nDownloading to: {output_dir}/")
        print("="*70)
        
        success_count = 0
        fail_count = 0
        
        for i, url in enumerate(urls, 1):
            print(f"\n[{i}/{len(urls)}]")
            
            if self.download_file(url, output_dir):
                success_count += 1
            else:
                fail_count += 1
            
            # Rate limiting (be nice to NASA servers)
            time.sleep(0.5)
        
        # Summary
        print("\n" + "="*70)
        print("DOWNLOAD COMPLETE")
        print("="*70)
        print(f"✓ Successfully downloaded: {success_count} files")
        if fail_count > 0:
            print(f"✗ Failed: {fail_count} files")
        print(f"📁 Location: {Path(output_dir).absolute()}")
        print("="*70)


def main():
    """Main execution"""
    
    # Configuration for California Poppy Fields
    CONFIG = {
        'tile_id': 'T11SLS',  # Antelope Valley
        'start_date': '2024-03-01',  # Spring bloom season
        'end_date': '2024-05-15',
        'output_dir': 'california_poppy_data',
        'bands': ['B04', 'B8A', 'Fmask'],  # Red, NIR, Cloud mask
        'max_files': None  # Set to a number like 30 for testing
    }
    
    print("\n🌸 California Poppy Bloom Detection - Data Downloader 🌸\n")
    print("Target: Antelope Valley California Poppy Reserve")
    print(f"Tile: {CONFIG['tile_id']}")
    print(f"Season: {CONFIG['start_date']} to {CONFIG['end_date']}")
    
    # Initialize downloader
    downloader = HLSDownloader()
    
    # Download data
    downloader.download_dataset(
        tile_id=CONFIG['tile_id'],
        start_date=CONFIG['start_date'],
        end_date=CONFIG['end_date'],
        output_dir=CONFIG['output_dir'],
        bands=CONFIG['bands'],
        max_files=CONFIG['max_files']
    )
    
    print("\n✨ Next steps:")
    print("1. Run the bloom detection script on the downloaded data")
    print("2. Adjust parameters based on your results")
    print("3. Create visualizations and export hotspots")


if __name__ == "__main__":
    main()
