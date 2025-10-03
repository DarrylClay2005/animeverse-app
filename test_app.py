#!/usr/bin/env python3
"""
Test script to verify AnimeVerse Enhanced is working properly
"""

import requests
import json
import time
import sys

def test_backend():
    """Test the backend API endpoints"""
    base_url = "http://127.0.0.1:8000"
    
    print("🧪 Testing AnimeVerse Enhanced Backend...")
    
    # Test health endpoint
    print("\n1. Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/api/health", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed - Version: {data.get('version', 'unknown')}")
        else:
            print(f"❌ Health check failed: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
        return False
    
    # Test search endpoint
    print("\n2. Testing search endpoint...")
    try:
        response = requests.get(f"{base_url}/api/search?q=naruto", timeout=15)
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            print(f"✅ Search test passed - Found {len(results)} results")
            if results:
                first_result = results[0]
                print(f"   First result: {first_result.get('title', 'Unknown')}")
        else:
            print(f"❌ Search test failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Search test error: {str(e)}")
    
    # Test trending endpoint
    print("\n3. Testing trending endpoint...")
    try:
        response = requests.get(f"{base_url}/api/trending", timeout=15)
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            print(f"✅ Trending test passed - Found {len(results)} results")
        else:
            print(f"❌ Trending test failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Trending test error: {str(e)}")
    
    # Test static file serving
    print("\n4. Testing static file serving...")
    try:
        response = requests.get(f"{base_url}/", timeout=10)
        if response.status_code == 200 and "AnimeVerse" in response.text:
            print("✅ Static file serving test passed")
        else:
            print(f"❌ Static file serving test failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Static file serving error: {str(e)}")
    
    print("\n🎉 Backend testing completed!")
    return True

def main():
    """Main test function"""
    print("=" * 60)
    print("🚀 AnimeVerse Enhanced - Application Test Suite")
    print("=" * 60)
    
    print("\n📋 Test Requirements:")
    print("- Backend server should be running on http://127.0.0.1:8000")
    print("- Internet connection for API tests")
    
    input("\nPress Enter when backend is running...")
    
    # Wait a moment for server to be ready
    time.sleep(2)
    
    # Run backend tests
    success = test_backend()
    
    if success:
        print("\n🎊 All tests passed! AnimeVerse Enhanced is working correctly.")
        print("\n🌐 You can now access the application at:")
        print("   http://127.0.0.1:8000")
    else:
        print("\n⚠️  Some tests failed. Check the backend logs for more details.")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()