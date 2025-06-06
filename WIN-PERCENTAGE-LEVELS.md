# Win Percentage Classification System

## 5-Level Color Coding

The YSBA Standings app now uses a refined 5-level win percentage classification system for better visual differentiation of team performance.

### Classification Levels

| Level | Range | CSS Class | Background Color | Text Color | Description |
|-------|-------|-----------|------------------|------------|-------------|
| **High** | 0.750+ | `win-percentage high` | Light Green (#f9fafb) | Dark Green (#059669) | Excellent performance |
| **Medium-High** | 0.600-0.749 | `win-percentage medium-high` | Very Light Green (#f0fdf4) | Green (#16a34a) | Good performance |
| **Medium** | 0.450-0.599 | `win-percentage medium` | Light Yellow (#fef3c7) | Dark Gray (#374151) | Average performance |
| **Low-Medium** | 0.300-0.449 | `win-percentage low-medium` | Light Orange (#fef3c7) | Orange (#d97706) | Below average |
| **Low** | 0.000-0.299 | `win-percentage low` | Light Red (#fef2f2) | Red (#dc2626) | Poor performance |

### Implementation

#### CSS Classes
```css
.win-percentage {
  font-weight: var(--font-weight-semibold);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
}

.win-percentage.high {
  background-color: var(--green-50);
  color: var(--green-600);
}

.win-percentage.medium-high {
  background-color: #f0fdf4;
  color: #16a34a;
}

.win-percentage.medium {
  background-color: var(--warning-bg);
  color: var(--gray-800);
}

.win-percentage.low-medium {
  background-color: #fef3c7;
  color: #d97706;
}

.win-percentage.low {
  background-color: #fef2f2;
  color: var(--red-600);
}
```

#### JavaScript Logic
```javascript
const winPct = parseFloat(team.winPercentage);
let winPctClass = 'win-percentage ';
if (winPct >= 0.75) winPctClass += 'high';
else if (winPct >= 0.60) winPctClass += 'medium-high';
else if (winPct >= 0.45) winPctClass += 'medium';
else if (winPct >= 0.30) winPctClass += 'low-medium';
else winPctClass += 'low';
```

### Email Template Support

The email notification system also uses the same 5-level classification for consistent styling across all platforms.

### Benefits

1. **Better Granularity**: More nuanced performance visualization
2. **Clearer Distinctions**: Easier to differentiate between similar performing teams
3. **Improved UX**: Better visual hierarchy in standings table
4. **Consistent**: Same system used in web interface and email notifications

### Visual Examples

- **0.857** → High (bright green badge)
- **0.667** → Medium-High (light green badge)  
- **0.500** → Medium (yellow badge)
- **0.375** → Low-Medium (orange badge)
- **0.250** → Low (red badge) 