#!/usr/bin/env python3
"""
Simple launcher for the Color Scheme Generator
"""

try:
    from color_scheme_generator import ColorSchemeGenerator
    
    def main():
        print("Starting Color Scheme Generator...")
        app = ColorSchemeGenerator()
        app.run()
        print("Application closed.")
    
    if __name__ == "__main__":
        main()

except ImportError as e:
    print(f"Import Error: {e}")
    print("Make sure color_scheme_generator.py is in the same directory.")
except Exception as e:
    print(f"Error: {e}")
    input("Press Enter to exit...")