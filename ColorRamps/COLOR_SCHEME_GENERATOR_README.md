# Color Scheme Generator

A Python GUI application for creating and editing color gradients, similar to CloudCompare's color ramp generator.

## Features

- **Interactive Gradient Editor**: Click on the gradient preview to add color stops, right-click to remove them
- **Visual Preview**: Real-time gradient preview with RGB component breakdowns  
- **Color Picker Integration**: Built-in color picker for precise color selection
- **Preset Schemes**: Heat map, Rainbow, and Ocean preset color schemes
- **Import/Export**: Load and save color schemes in JSON format
- **Fine Control**: Precise position adjustment with spinbox controls
- **Multiple Views**: View individual RGB components alongside the full gradient

## Requirements

- Python 3.6+
- tkinter (usually included with Python)

## Usage

### Quick Start

1. Run the application:
   ```bash
   python run_color_generator.py
   ```

2. The application will open with a default blue-to-red gradient

### Creating Color Schemes

**Adding Color Stops:**
- Click anywhere on the gradient preview to add a new color stop
- Use the "Add Stop" button to add a stop at 50% position
- Select a color stop from the list and use "Edit Color" to change its color

**Removing Color Stops:**
- Right-click near a color stop marker on the gradient to remove it
- Select a stop in the list and click "Remove"

**Adjusting Positions:**
- Select a color stop from the list
- Use the position spinbox to precisely adjust its location (0.0 to 1.0)

**Preset Schemes:**
- Click "Heat Map", "Rainbow", or "Ocean" buttons to load preset gradients
- These provide good starting points for common color schemes

### File Operations

**Saving:**
- Use "Save" or "Save As" to export your color scheme as a JSON file
- The format matches your sample file structure

**Loading:**
- Use "Load" to import existing color schemes
- Compatible with the JSON format used by your sample file

**Creating New:**
- Use "New" to start fresh with a basic black-to-white gradient

### Tips

- The gradient preview shows small triangular markers for each color stop
- Selected color stops are highlighted in yellow, dragged stops in red
- **Middle-click and drag** color stops directly in the gradient for intuitive positioning
- The bottom panel shows individual RGB components for analysis
- Use the description field to document your color scheme's purpose
- Right-click functionality makes it easy to quickly remove unwanted stops
- The cursor changes to a hand when dragging stops

## File Format

Color schemes are saved in JSON format with this structure:

```json
{
  "name": "Scheme Name",
  "type": "gradient", 
  "description": "Description text",
  "colors": [
    {"position": 0.0, "color": [0.0, 0.1, 0.4]},
    {"position": 0.5, "color": [0.5, 0.6, 0.8]},
    {"position": 1.0, "color": [1.0, 1.0, 0.2]}
  ]
}
```

- `position`: Float from 0.0 to 1.0 representing position in gradient
- `color`: RGB values as floats from 0.0 to 1.0

## Mouse Controls

- **Left-click**: Add new color stop at clicked position
- **Middle-click + drag**: Grab and move existing color stops
- **Right-click**: Remove nearby color stop  
- **List selection**: Shows position in spinbox for fine adjustment

## Visual Feedback

- **White triangles**: Normal color stops
- **Yellow triangles**: Selected color stop
- **Red triangles**: Color stop being dragged

## Troubleshooting

- If the application doesn't start, ensure Python 3.6+ is installed
- On some systems, you may need to install tkinter separately
- Make sure both `color_scheme_generator.py` and `run_color_generator.py` are in the same directory