"""Run Echo English on a local web server.

Usage:
    python3 start.py
Then open http://localhost:8899
"""
import http.server
import os
import socketserver
import webbrowser

PORT = 8899
os.chdir(os.path.dirname(os.path.abspath(__file__)))
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = "http://localhost:" + str(PORT)
    print("Echo English is running at " + url)
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)
    httpd.serve_forever()
