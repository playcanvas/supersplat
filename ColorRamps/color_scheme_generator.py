import tkinter as tk
from tkinter import ttk, colorchooser, filedialog, messagebox
import json
import math
from typing import List, Tuple, Dict, Any

class ColorStop:
    """Represents a single color stop in a gradient."""
    def __init__(self, position: float, color: Tuple[float, float, float]):
        self.position = max(0.0, min(1.0, position))  # Clamp between 0 and 1
        self.color = color  # RGB values between 0 and 1
    
    def to_hex(self) -> str:
        """Convert RGB float values to hex string."""
        r = int(self.color[0] * 255)
        g = int(self.color[1] * 255)
        b = int(self.color[2] * 255)
        return f"#{r:02x}{g:02x}{b:02x}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "position": self.position,
            "color": list(self.color)
        }

class ColorScheme:
    """Represents a complete color scheme with metadata and color stops."""
    def __init__(self, name: str = "Untitled", description: str = "", scheme_type: str = "gradient"):
        self.name = name
        self.description = description
        self.type = scheme_type
        self.color_stops: List[ColorStop] = []
    
    def add_color_stop(self, position: float, color: Tuple[float, float, float]):
        """Add a new color stop and sort by position."""
        self.color_stops.append(ColorStop(position, color))
        self.color_stops.sort(key=lambda x: x.position)
    
    def remove_color_stop(self, index: int):
        """Remove a color stop by index."""
        if 0 <= index < len(self.color_stops):
            del self.color_stops[index]
    
    def get_color_at_position(self, position: float) -> Tuple[float, float, float]:
        """Interpolate color at a given position."""
        position = max(0.0, min(1.0, position))
        
        if not self.color_stops:
            return (0.5, 0.5, 0.5)  # Gray default
        
        if len(self.color_stops) == 1:
            return self.color_stops[0].color
        
        # Find the two stops to interpolate between
        for i in range(len(self.color_stops) - 1):
            if position <= self.color_stops[i + 1].position:
                stop1 = self.color_stops[i]
                stop2 = self.color_stops[i + 1]
                
                # Linear interpolation
                if stop2.position == stop1.position:
                    return stop1.color
                
                t = (position - stop1.position) / (stop2.position - stop1.position)
                return (
                    stop1.color[0] + t * (stop2.color[0] - stop1.color[0]),
                    stop1.color[1] + t * (stop2.color[1] - stop1.color[1]),
                    stop1.color[2] + t * (stop2.color[2] - stop1.color[2])
                )
        
        # If position is beyond the last stop
        return self.color_stops[-1].color
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "type": self.type,
            "description": self.description,
            "colors": [stop.to_dict() for stop in self.color_stops]
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ColorScheme':
        """Create ColorScheme from dictionary."""
        scheme = cls(
            name=data.get("name", "Untitled"),
            description=data.get("description", ""),
            scheme_type=data.get("type", "gradient")
        )
        
        for color_data in data.get("colors", []):
            position = color_data["position"]
            color = tuple(color_data["color"])
            scheme.add_color_stop(position, color)
        
        return scheme

class ColorSchemeGenerator:
    """Main GUI application for generating color schemes."""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Color Scheme Generator")
        self.root.geometry("1800x600")
        self.root.configure(bg="#f0f0f0")
        
        # Current color scheme
        self.current_scheme = ColorScheme()
        self.selected_stop_index = -1
        self.position_trace_id = None
        
        # Dragging state for middle mouse button
        self.dragging_stop_index = -1
        self.drag_start_x = 0
        
        # GUI Components
        self.setup_ui()
        self.load_default_scheme()
        self.update_display()
    
    def setup_ui(self):
        """Set up the user interface."""
        # Main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(1, weight=1)
        
        # Left panel - Controls
        self.setup_control_panel(main_frame)
        
        # Right panel - Preview and stops
        self.setup_preview_panel(main_frame)
        
        # Bottom panel - File operations
        self.setup_file_panel(main_frame)
    
    def setup_control_panel(self, parent):
        """Set up the control panel on the left side."""
        control_frame = ttk.LabelFrame(parent, text="Color Scheme Properties", padding="10")
        control_frame.grid(row=0, column=0, rowspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), padx=(0, 10))
        
        # Scheme name
        ttk.Label(control_frame, text="Name:").grid(row=0, column=0, sticky=tk.W, pady=2)
        self.name_var = tk.StringVar(value=self.current_scheme.name)
        self.name_var.trace_add("write", self.on_name_change)
        ttk.Entry(control_frame, textvariable=self.name_var, width=25).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=2)
        
        # Description
        ttk.Label(control_frame, text="Description:").grid(row=1, column=0, sticky=(tk.W, tk.N), pady=2)
        self.description_text = tk.Text(control_frame, height=3, width=25)
        self.description_text.grid(row=1, column=1, sticky=(tk.W, tk.E), pady=2)
        self.description_text.bind("<KeyRelease>", self.on_description_change)
        
        # Color stops list
        ttk.Label(control_frame, text="Color Stops:").grid(row=2, column=0, columnspan=2, sticky=tk.W, pady=(10, 2))
        
        # Listbox with scrollbar
        listbox_frame = ttk.Frame(control_frame)
        listbox_frame.grid(row=3, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=2)
        
        self.stops_listbox = tk.Listbox(listbox_frame, height=8, selectmode=tk.SINGLE)
        scrollbar = ttk.Scrollbar(listbox_frame, orient=tk.VERTICAL, command=self.stops_listbox.yview)
        self.stops_listbox.configure(yscrollcommand=scrollbar.set)
        
        self.stops_listbox.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        listbox_frame.columnconfigure(0, weight=1)
        listbox_frame.rowconfigure(0, weight=1)
        
        self.stops_listbox.bind("<<ListboxSelect>>", self.on_stop_select)
        
        # Stop control buttons
        button_frame = ttk.Frame(control_frame)
        button_frame.grid(row=4, column=0, columnspan=2, pady=5)
        
        ttk.Button(button_frame, text="Add Stop", command=self.add_color_stop).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Edit Color", command=self.edit_selected_color).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Remove", command=self.remove_selected_stop).pack(side=tk.LEFT, padx=2)
        
        # Position control
        ttk.Label(control_frame, text="Position:").grid(row=5, column=0, sticky=tk.W, pady=(10, 2))
        self.position_var = tk.DoubleVar()
        self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
        self.position_spinbox = ttk.Spinbox(control_frame, from_=0.0, to=1.0, increment=0.01, 
                                          textvariable=self.position_var, width=10, 
                                          format="%.3f")
        self.position_spinbox.grid(row=5, column=1, sticky=tk.W, pady=2)
        
        # Bind additional events for the spinbox
        self.position_spinbox.bind('<Return>', self.on_position_enter)
        self.position_spinbox.bind('<FocusOut>', self.on_position_enter)
        
        # Preset schemes
        ttk.Label(control_frame, text="Presets:").grid(row=6, column=0, columnspan=2, sticky=tk.W, pady=(10, 2))
        preset_frame = ttk.Frame(control_frame)
        preset_frame.grid(row=7, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=2)
        
        ttk.Button(preset_frame, text="Heat Map", command=lambda: self.load_preset("heat")).pack(side=tk.LEFT, padx=2)
        ttk.Button(preset_frame, text="Rainbow", command=lambda: self.load_preset("rainbow")).pack(side=tk.LEFT, padx=2)
        ttk.Button(preset_frame, text="Ocean", command=lambda: self.load_preset("ocean")).pack(side=tk.LEFT, padx=2)
        
        control_frame.columnconfigure(1, weight=1)
        control_frame.rowconfigure(3, weight=1)
    
    def setup_preview_panel(self, parent):
        """Set up the preview panel on the right side."""
        preview_frame = ttk.LabelFrame(parent, text="Gradient Preview", padding="10")
        preview_frame.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Gradient canvas
        self.canvas = tk.Canvas(preview_frame, height=100, bg="white", relief=tk.SUNKEN, borderwidth=2)
        self.canvas.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<Button-2>", self.on_canvas_middle_click)  # Middle-click to start dragging
        self.canvas.bind("<B2-Motion>", self.on_canvas_middle_drag)  # Middle-drag to move stop
        self.canvas.bind("<ButtonRelease-2>", self.on_canvas_middle_release)  # Release middle button
        self.canvas.bind("<Button-3>", self.on_canvas_right_click)  # Right-click for context menu
        
        # Color bars (horizontal gradient display)
        self.color_bar_canvas = tk.Canvas(preview_frame, height=200, bg="white", relief=tk.SUNKEN, borderwidth=2)
        self.color_bar_canvas.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=5)
        
        preview_frame.columnconfigure(0, weight=1)
    
    def setup_file_panel(self, parent):
        """Set up file operations panel at the bottom."""
        file_frame = ttk.Frame(parent)
        file_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(10, 0))
        
        ttk.Button(file_frame, text="New", command=self.new_scheme).pack(side=tk.LEFT, padx=2)
        ttk.Button(file_frame, text="Load", command=self.load_scheme).pack(side=tk.LEFT, padx=2)
        ttk.Button(file_frame, text="Save", command=self.save_scheme).pack(side=tk.LEFT, padx=2)
        ttk.Button(file_frame, text="Save As", command=self.save_scheme_as).pack(side=tk.LEFT, padx=2)
        
        # Status label
        self.status_label = ttk.Label(file_frame, text="Ready")
        self.status_label.pack(side=tk.RIGHT, padx=10)
    
    def load_default_scheme(self):
        """Load a default color scheme."""
        self.current_scheme = ColorScheme("Default", "A simple blue to red gradient")
        self.current_scheme.add_color_stop(0.0, (0.0, 0.0, 1.0))  # Blue
        self.current_scheme.add_color_stop(0.5, (0.5, 0.0, 0.5))  # Purple
        self.current_scheme.add_color_stop(1.0, (1.0, 0.0, 0.0))  # Red
    
    def update_display(self):
        """Update all display elements."""
        # Update name and description
        self.name_var.set(self.current_scheme.name)
        self.description_text.delete(1.0, tk.END)
        self.description_text.insert(1.0, self.current_scheme.description)
        
        # Update stops listbox
        self.stops_listbox.delete(0, tk.END)
        for i, stop in enumerate(self.current_scheme.color_stops):
            color_text = f"RGB({stop.color[0]:.2f}, {stop.color[1]:.2f}, {stop.color[2]:.2f})"
            self.stops_listbox.insert(tk.END, f"{stop.position:.3f}: {color_text}")
        
        # Update position variable if a stop is selected
        if self.selected_stop_index >= 0 and self.selected_stop_index < len(self.current_scheme.color_stops):
            stop = self.current_scheme.color_stops[self.selected_stop_index]
            self.position_var.set(stop.position)
        
        # Update canvases
        self.draw_gradient()
        self.draw_color_bars()
    
    def draw_gradient(self):
        """Draw the gradient preview."""
        self.canvas.delete("all")
        
        if not self.current_scheme.color_stops:
            return
        
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        
        if canvas_width <= 1:  # Canvas not yet rendered
            self.root.after(100, self.draw_gradient)
            return
        
        # Draw gradient
        for x in range(canvas_width):
            position = x / (canvas_width - 1)
            color = self.current_scheme.get_color_at_position(position)
            hex_color = ColorStop(0, color).to_hex()
            self.canvas.create_line(x, 0, x, canvas_height, fill=hex_color, width=1)
        
        # Draw stop markers
        for i, stop in enumerate(self.current_scheme.color_stops):
            x = int(stop.position * (canvas_width - 1))
            # Draw marker triangle
            marker_size = 8
            points = [x, 0, x - marker_size//2, marker_size, x + marker_size//2, marker_size]
            
            # Color coding for different states
            if i == self.dragging_stop_index:
                fill_color = "red"  # Red when dragging
                outline_width = 3
            elif i == self.selected_stop_index:
                fill_color = "yellow"  # Yellow when selected
                outline_width = 2
            else:
                fill_color = "white"  # White for normal stops
                outline_width = 2
            
            self.canvas.create_polygon(points, fill=fill_color, outline="black", width=outline_width)
    
    def draw_color_bars(self):
        """Draw individual color bars for each RGB component."""
        self.color_bar_canvas.delete("all")
        
        if not self.current_scheme.color_stops:
            return
        
        canvas_width = self.color_bar_canvas.winfo_width()
        canvas_height = self.color_bar_canvas.winfo_height()
        
        if canvas_width <= 1:
            self.root.after(100, self.draw_color_bars)
            return
        
        bar_height = canvas_height // 4
        
        # Draw RGB component bars
        components = ['R', 'G', 'B']
        for comp_idx, component in enumerate(components):
            y_start = comp_idx * bar_height
            
            for x in range(canvas_width):
                position = x / (canvas_width - 1)
                color = self.current_scheme.get_color_at_position(position)
                
                # Create monochrome representation of the component
                intensity = int(color[comp_idx] * 255)
                if component == 'R':
                    bar_color = f"#{intensity:02x}0000"
                elif component == 'G':
                    bar_color = f"#00{intensity:02x}00"
                else:  # B
                    bar_color = f"#0000{intensity:02x}"
                
                self.color_bar_canvas.create_line(x, y_start, x, y_start + bar_height - 1, 
                                                fill=bar_color, width=1)
            
            # Label
            self.color_bar_canvas.create_text(10, y_start + bar_height//2, text=component, 
                                            fill="white", font=("Arial", 12, "bold"))
        
        # Full color bar at bottom
        y_start = 3 * bar_height
        for x in range(canvas_width):
            position = x / (canvas_width - 1)
            color = self.current_scheme.get_color_at_position(position)
            hex_color = ColorStop(0, color).to_hex()
            self.color_bar_canvas.create_line(x, y_start, x, y_start + bar_height - 1, 
                                            fill=hex_color, width=1)
        
        # Label for full color
        self.color_bar_canvas.create_text(10, y_start + bar_height//2, text="RGB", 
                                        fill="black", font=("Arial", 12, "bold"))
    
    def on_canvas_click(self, event):
        """Handle canvas click to add new color stop."""
        canvas_width = self.canvas.winfo_width()
        position = event.x / (canvas_width - 1)
        
        # Get color at clicked position
        current_color = self.current_scheme.get_color_at_position(position)
        
        # Open color picker
        color_result = colorchooser.askcolor(
            color=ColorStop(0, current_color).to_hex(),
            title="Choose Color for New Stop"
        )
        
        if color_result[0]:  # User didn't cancel
            rgb = tuple(c / 255.0 for c in color_result[0])
            self.current_scheme.add_color_stop(position, rgb)
            self.update_display()
            self.status_label.config(text=f"Added color stop at position {position:.3f}")
    
    def on_canvas_right_click(self, event):
        """Handle right-click to remove nearby color stop."""
        canvas_width = self.canvas.winfo_width()
        click_position = event.x / (canvas_width - 1)
        
        # Find closest stop within reasonable distance
        closest_stop = None
        closest_distance = float('inf')
        
        for i, stop in enumerate(self.current_scheme.color_stops):
            distance = abs(stop.position - click_position)
            if distance < closest_distance and distance < 0.05:  # Within 5% of gradient
                closest_distance = distance
                closest_stop = i
        
        if closest_stop is not None and len(self.current_scheme.color_stops) > 1:
            self.current_scheme.remove_color_stop(closest_stop)
            self.update_display()
            self.status_label.config(text=f"Removed color stop {closest_stop}")
    
    def on_canvas_middle_click(self, event):
        """Handle middle mouse button click to start dragging a color stop."""
        canvas_width = self.canvas.winfo_width()
        click_position = event.x / (canvas_width - 1)
        
        # Find the closest color stop within a reasonable distance
        closest_stop = None
        closest_distance = float('inf')
        
        for i, stop in enumerate(self.current_scheme.color_stops):
            distance = abs(stop.position - click_position)
            if distance < closest_distance and distance < 0.05:  # Within 5% of gradient
                closest_distance = distance
                closest_stop = i
        
        if closest_stop is not None:
            self.dragging_stop_index = closest_stop
            self.drag_start_x = event.x
            
            # Select the stop being dragged
            self.selected_stop_index = closest_stop
            
            # Update listbox selection
            self.stops_listbox.selection_clear(0, tk.END)
            self.stops_listbox.selection_set(closest_stop)
            
            # Update position variable
            stop = self.current_scheme.color_stops[closest_stop]
            self.position_var.trace_remove("write", self.position_trace_id)
            self.position_var.set(stop.position)
            self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
            
            # Change cursor to indicate dragging
            self.canvas.config(cursor="hand2")
            
            self.draw_gradient()  # Update highlighting
            self.status_label.config(text=f"Dragging color stop {closest_stop}")
        else:
            self.dragging_stop_index = -1
    
    def on_canvas_middle_drag(self, event):
        """Handle middle mouse button dragging to move a color stop."""
        if self.dragging_stop_index >= 0:
            canvas_width = self.canvas.winfo_width()
            new_position = max(0.0, min(1.0, event.x / (canvas_width - 1)))
            
            # Update the stop position
            stop = self.current_scheme.color_stops[self.dragging_stop_index]
            stop.position = new_position
            
            # Re-sort stops by position
            self.current_scheme.color_stops.sort(key=lambda x: x.position)
            
            # Find the new index after sorting
            for i, s in enumerate(self.current_scheme.color_stops):
                if s is stop:
                    self.dragging_stop_index = i
                    self.selected_stop_index = i
                    break
            
            # Update position variable without triggering events
            self.position_var.trace_remove("write", self.position_trace_id)
            self.position_var.set(stop.position)
            self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
            
            # Update listbox selection to follow the moved stop
            self.stops_listbox.selection_clear(0, tk.END)
            self.stops_listbox.selection_set(self.selected_stop_index)
            
            # Update displays
            self.update_display()
            self.status_label.config(text=f"Position: {new_position:.3f}")
    
    def on_canvas_middle_release(self, event):
        """Handle middle mouse button release to finish dragging."""
        if self.dragging_stop_index >= 0:
            # Reset cursor
            self.canvas.config(cursor="")
            
            # Final update
            stop = self.current_scheme.color_stops[self.dragging_stop_index]
            self.status_label.config(text=f"Moved color stop to position {stop.position:.3f}")
            
            self.dragging_stop_index = -1
            self.draw_gradient()  # Final redraw without drag highlighting
    
    def add_color_stop(self):
        """Add a new color stop at 50% position."""
        position = 0.5
        current_color = self.current_scheme.get_color_at_position(position)
        
        color_result = colorchooser.askcolor(
            color=ColorStop(0, current_color).to_hex(),
            title="Choose Color for New Stop"
        )
        
        if color_result[0]:
            rgb = tuple(c / 255.0 for c in color_result[0])
            self.current_scheme.add_color_stop(position, rgb)
            self.update_display()
    
    def edit_selected_color(self):
        """Edit the color of the selected stop."""
        selection = self.stops_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a color stop to edit.")
            return
        
        index = selection[0]
        stop = self.current_scheme.color_stops[index]
        
        color_result = colorchooser.askcolor(
            color=stop.to_hex(),
            title="Edit Color Stop"
        )
        
        if color_result[0]:
            rgb = tuple(c / 255.0 for c in color_result[0])
            stop.color = rgb
            self.update_display()
    
    def remove_selected_stop(self):
        """Remove the selected color stop."""
        selection = self.stops_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a color stop to remove.")
            return
        
        if len(self.current_scheme.color_stops) <= 1:
            messagebox.showwarning("Cannot Remove", "Cannot remove the last color stop.")
            return
        
        index = selection[0]
        self.current_scheme.remove_color_stop(index)
        self.update_display()
    
    def on_stop_select(self, event):
        """Handle color stop selection."""
        selection = self.stops_listbox.curselection()
        if selection and selection[0] < len(self.current_scheme.color_stops):
            self.selected_stop_index = selection[0]
            stop = self.current_scheme.color_stops[self.selected_stop_index]
            
            # Temporarily disable tracing to avoid recursion
            self.position_var.trace_remove("write", self.position_trace_id)
            self.position_var.set(stop.position)
            # Re-enable tracing
            self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
            
        else:
            self.selected_stop_index = -1
            # Clear position when nothing is selected
            self.position_var.trace_remove("write", self.position_trace_id)
            self.position_var.set(0.0)
            self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
        
        self.draw_gradient()  # Update marker highlighting
    
    def on_position_enter(self, event):
        """Handle Enter key or focus out in position spinbox."""
        self.on_position_change()
    
    def on_position_change(self, *args):
        """Handle position change for selected stop."""
        if self.selected_stop_index >= 0 and self.selected_stop_index < len(self.current_scheme.color_stops):
            try:
                new_position = self.position_var.get()
                stop = self.current_scheme.color_stops[self.selected_stop_index]
                old_position = stop.position
                stop.position = max(0.0, min(1.0, new_position))
                
                # Only update if position actually changed
                if abs(old_position - stop.position) > 0.001:
                    # Re-sort stops
                    self.current_scheme.color_stops.sort(key=lambda x: x.position)
                    
                    # Find new index after sorting
                    for i, s in enumerate(self.current_scheme.color_stops):
                        if s is stop:
                            self.selected_stop_index = i
                            break
                    
                    # Update display but temporarily disable position variable tracing
                    self.position_var.trace_remove("write", self.position_trace_id)
                    self.update_display()
                    # Re-enable tracing
                    self.position_trace_id = self.position_var.trace_add("write", self.on_position_change)
                    
                    # Update the listbox selection
                    self.stops_listbox.selection_clear(0, tk.END)
                    self.stops_listbox.selection_set(self.selected_stop_index)
                    
            except (ValueError, tk.TclError):
                # Invalid value entered, reset to current position
                if self.selected_stop_index >= 0 and self.selected_stop_index < len(self.current_scheme.color_stops):
                    stop = self.current_scheme.color_stops[self.selected_stop_index]
                    self.position_var.set(stop.position)
    
    def on_name_change(self, *args):
        """Handle name change."""
        self.current_scheme.name = self.name_var.get()
    
    def on_description_change(self, event):
        """Handle description change."""
        self.current_scheme.description = self.description_text.get(1.0, tk.END).strip()
    
    def load_preset(self, preset_name):
        """Load a preset color scheme."""
        if preset_name == "heat":
            self.current_scheme = ColorScheme("Heat Map", "Classic heat map from black through red, orange, yellow to white")
            self.current_scheme.add_color_stop(0.0, (0.0, 0.0, 0.0))    # Black
            self.current_scheme.add_color_stop(0.25, (0.5, 0.0, 0.0))   # Dark red
            self.current_scheme.add_color_stop(0.5, (1.0, 0.0, 0.0))    # Red
            self.current_scheme.add_color_stop(0.75, (1.0, 0.5, 0.0))   # Orange
            self.current_scheme.add_color_stop(1.0, (1.0, 1.0, 0.0))    # Yellow
        
        elif preset_name == "rainbow":
            self.current_scheme = ColorScheme("Rainbow", "Classic rainbow spectrum")
            self.current_scheme.add_color_stop(0.0, (1.0, 0.0, 0.0))    # Red
            self.current_scheme.add_color_stop(0.167, (1.0, 0.5, 0.0))  # Orange
            self.current_scheme.add_color_stop(0.333, (1.0, 1.0, 0.0))  # Yellow
            self.current_scheme.add_color_stop(0.5, (0.0, 1.0, 0.0))    # Green
            self.current_scheme.add_color_stop(0.667, (0.0, 0.0, 1.0))  # Blue
            self.current_scheme.add_color_stop(0.833, (0.3, 0.0, 0.5))  # Indigo
            self.current_scheme.add_color_stop(1.0, (0.5, 0.0, 1.0))    # Violet
        
        elif preset_name == "ocean":
            self.current_scheme = ColorScheme("Ocean", "Ocean depths color scheme")
            self.current_scheme.add_color_stop(0.0, (0.0, 0.1, 0.4))    # Dark blue
            self.current_scheme.add_color_stop(0.3, (0.0, 0.3, 0.7))    # Blue
            self.current_scheme.add_color_stop(0.6, (0.0, 0.6, 0.9))    # Light blue
            self.current_scheme.add_color_stop(0.8, (0.2, 0.8, 0.8))    # Cyan
            self.current_scheme.add_color_stop(1.0, (0.8, 1.0, 0.6))    # Light green
        
        self.update_display()
    
    def new_scheme(self):
        """Create a new color scheme."""
        if messagebox.askokcancel("New Scheme", "This will clear the current scheme. Continue?"):
            self.current_scheme = ColorScheme("Untitled", "New color scheme")
            self.current_scheme.add_color_stop(0.0, (0.0, 0.0, 0.0))  # Black
            self.current_scheme.add_color_stop(1.0, (1.0, 1.0, 1.0))  # White
            self.selected_stop_index = -1
            self.update_display()
    
    def load_scheme(self):
        """Load a color scheme from file."""
        filename = filedialog.askopenfilename(
            title="Load Color Scheme",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'r') as f:
                    data = json.load(f)
                
                self.current_scheme = ColorScheme.from_dict(data)
                self.selected_stop_index = -1
                self.update_display()
                self.status_label.config(text=f"Loaded: {filename}")
                
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load file:\n{str(e)}")
    
    def save_scheme(self):
        """Save current color scheme to file."""
        filename = filedialog.asksaveasfilename(
            title="Save Color Scheme",
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'w') as f:
                    json.dump(self.current_scheme.to_dict(), f, indent=2)
                
                self.status_label.config(text=f"Saved: {filename}")
                
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save file:\n{str(e)}")
    
    def save_scheme_as(self):
        """Save current color scheme with a new name."""
        self.save_scheme()
    
    def run(self):
        """Start the GUI application."""
        # Bind window close event
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Start main loop
        self.root.mainloop()
    
    def on_closing(self):
        """Handle application closing."""
        self.root.quit()
        self.root.destroy()

if __name__ == "__main__":
    app = ColorSchemeGenerator()
    app.run()