# Test Cases Documentation

This document catalogs all test cases organized by user story and task.

## User Story 54: Queue Position Confirmation

**As a learner I want to receive a confirmation with my queue position when my mission is accepted so that I know my mission will be executed.**

### Task 55-57: Queue Position in Response

**Test File:** `src/__tests__/unit/confirmation-response.test.ts`

#### Test Case 1: Confirmation response includes queue position and estimated wait
- **Type:** Unit Test
- **Description:** Verifies that mission submission response includes queue position and estimated wait time
- **Given:** A valid mission submission DTO
- **When:** The mission is submitted via MissionService
- **Then:** The response includes queuePosition and estimatedWait fields
- **Expected:** 
  - `queuePosition` = 3 (third in queue)
  - `estimatedWait` = 180 seconds (2 missions × 90 seconds)
- **Status:** ✅ Passing

#### Test Case 2: Queue position 1 has zero estimated wait
- **Type:** Unit Test
- **Description:** Verifies that the first mission in queue has zero wait time
- **Given:** A mission submitted to an empty queue
- **When:** The mission is submitted via MissionService
- **Then:** The response shows position 1 with 0 seconds wait
- **Expected:** 
  - `queuePosition` = 1
  - `estimatedWait` = 0
- **Status:** ✅ Passing

#### Test Case 3: Handles empty queue correctly
- **Type:** Unit Test
- **Description:** Verifies correct handling when submitting to an empty yard queue
- **Given:** A mission submitted to a yard with no queued missions
- **When:** The mission is submitted via MissionService
- **Then:** The mission becomes first in queue with no wait time
- **Expected:** 
  - `queuePosition` = 1
  - `estimatedWait` = 0
- **Status:** ✅ Passing

---

## User Story 21: Command Restrictions (Sandbox Safety)

**As a learner I want the editor to restrict available commands to approved rover functions so that I cannot submit unsafe code.**

### Task 22-24: Allowlist Enforcement

**Test File:** `src/__tests__/unit/allowlist.test.ts`

#### Approved Rover Commands

##### Test Case 1: Allows approved rover movement commands
- **Type:** Unit Test
- **Description:** Verifies that approved rover movement commands (forward, backward, turn_left, turn_right) pass validation
- **Given:** Code with approved rover movement commands
- **When:** Code is analyzed by AllowlistService
- **Then:** Validation passes with no violations
- **Status:** ✅ Passing

##### Test Case 2: Allows approved rover utility commands
- **Type:** Unit Test
- **Description:** Verifies that utility commands (wait, stop, get_distance, get_heading) are allowed
- **Given:** Code with rover utility and sensor commands
- **When:** Code is analyzed
- **Then:** No violations found
- **Status:** ✅ Passing

##### Test Case 3: Allows safe Python built-ins
- **Type:** Unit Test
- **Description:** Verifies that print(), range(), and control flow (for, if) are allowed
- **Given:** Code with loops, conditionals, and print statements
- **When:** Code is analyzed
- **Then:** Validation passes
- **Status:** ✅ Passing

#### Disallowed Imports

##### Test Case 4: Blocks 'os' module import
- **Type:** Unit Test
- **Description:** Blocks the most common dangerous import
- **Given:** Code with `import os`
- **When:** Code is analyzed
- **Then:** Violation reported with line number
- **Expected:** `ruleId: 'disallowed-import'`, line: 1
- **Status:** ✅ Passing

##### Test Case 5: Blocks 'subprocess' module import
- **Type:** Unit Test
- **Description:** Prevents command execution via subprocess
- **Given:** Code with `import subprocess`
- **When:** Code is analyzed
- **Then:** Violation reported mentioning 'subprocess'
- **Status:** ✅ Passing

##### Test Case 6: Blocks 'from ... import' pattern
- **Type:** Unit Test
- **Description:** Detects alternative import syntax
- **Given:** Code with `from os import path`
- **When:** Code is analyzed
- **Then:** Violation reported for 'os' module
- **Status:** ✅ Passing

##### Test Case 7: Blocks socket module for network access
- **Type:** Unit Test
- **Description:** Prevents network communication
- **Given:** Code with `import socket`
- **When:** Code is analyzed
- **Then:** Violation reported for 'socket'
- **Status:** ✅ Passing

##### Test Case 8: Blocks sys module
- **Type:** Unit Test
- **Description:** Prevents system introspection
- **Given:** Code with `import sys`
- **When:** Code is analyzed
- **Then:** Violation reported for 'sys'
- **Status:** ✅ Passing

#### Non-Rover Function Calls

##### Test Case 9: Blocks non-existent rover commands
- **Type:** Unit Test
- **Description:** Catches typos and unknown rover commands
- **Given:** Code with `rover.hack_mainframe()`
- **When:** Code is analyzed
- **Then:** Violation with `ruleId: 'disallowed-function'`
- **Status:** ✅ Passing

##### Test Case 10: Detects multiple violations
- **Type:** Unit Test
- **Description:** Reports all violations found in code
- **Given:** Code with multiple violations (imports + function calls)
- **When:** Code is analyzed
- **Then:** At least 2 violations reported
- **Status:** ✅ Passing

#### Dangerous Built-ins

##### Test Case 11: Blocks eval() built-in
- **Type:** Unit Test
- **Description:** Prevents code injection
- **Given:** Code with `eval("code")`
- **When:** Code is analyzed
- **Then:** Violation with `ruleId: 'dangerous-builtin'`
- **Status:** ✅ Passing

##### Test Case 12: Blocks exec() built-in
- **Type:** Unit Test
- **Description:** Prevents code execution
- **Given:** Code with `exec("import os")`
- **When:** Code is analyzed
- **Then:** Violation for 'exec' reported
- **Status:** ✅ Passing

##### Test Case 13: Blocks open() for file I/O
- **Type:** Unit Test
- **Description:** Prevents file system access
- **Given:** Code with `open('/etc/passwd')`
- **When:** Code is analyzed
- **Then:** Violation for 'open' reported
- **Status:** ✅ Passing

##### Test Case 14: Blocks __import__() dynamic imports
- **Type:** Unit Test
- **Description:** Prevents runtime import injection
- **Given:** Code with `__import__('os')`
- **When:** Code is analyzed
- **Then:** Violation for '__import__' reported
- **Status:** ✅ Passing

#### Error Message Formatting

##### Test Case 15: Includes line numbers in error messages
- **Type:** Unit Test
- **Description:** Helps learners locate issues
- **Given:** Code with violation on line 2
- **When:** Code is analyzed
- **Then:** Finding includes `line: 2`
- **Status:** ✅ Passing

##### Test Case 16: Formats error messages for display
- **Type:** Unit Test
- **Description:** Tests formatErrorMessage helper
- **Given:** Code with violations
- **When:** formatErrorMessage is called
- **Then:** Message contains 'violation', 'line', and module name
- **Status:** ✅ Passing

##### Test Case 17: Returns success message for valid code
- **Type:** Unit Test
- **Description:** Verify success message
- **Given:** Valid rover code
- **When:** formatErrorMessage is called with empty findings
- **Then:** Message contains 'passed'
- **Status:** ✅ Passing

#### AST Analyzer Direct Tests

##### Test Case 18: AST analyzer detects disallowed imports
- **Type:** Unit Test
- **Description:** Direct test of analyzer function
- **Given:** Code with disallowed import
- **When:** analyzeCodeForAllowlist is called
- **Then:** Returns finding with `ruleId: 'disallowed-import'`
- **Status:** ✅ Passing

##### Test Case 19: AST analyzer detects non-rover function calls
- **Type:** Unit Test
- **Description:** Direct test of function call detection
- **Given:** Code with `rover.hack_system()`
- **When:** analyzeCodeForAllowlist is called
- **Then:** Returns finding with `ruleId: 'disallowed-function'`
- **Status:** ✅ Passing

##### Test Case 20: AST analyzer returns empty for safe code
- **Type:** Unit Test
- **Description:** Verify no false positives
- **Given:** Valid rover code
- **When:** analyzeCodeForAllowlist is called
- **Then:** Returns empty array
- **Status:** ✅ Passing

### Task 25: Integration Tests - Unsafe Module Blocking

**Test File:** `src/__tests__/integration/unsafe-module-blocked.test.ts`

##### Test Case 1: Accepts mission with safe rover commands
- **Type:** Integration Test
- **Description:** Baseline test - verify normal missions work
- **Given:** Mission data with safe rover commands
- **When:** validateMission is called
- **Then:** Validation succeeds, data returned
- **Status:** ✅ Passing

##### Test Case 2: Rejects mission with os module import
- **Type:** Integration Test
- **Description:** End-to-end validation blocks 'os' import
- **Given:** Mission with `import os`
- **When:** validateMission is called
- **Then:** Validation fails, error mentions 'os' and 'not allowed'
- **Status:** ✅ Passing

##### Test Case 3: Rejects mission with subprocess import
- **Type:** Integration Test
- **Description:** Prevents command execution
- **Given:** Mission with `import subprocess`
- **When:** validateMission is called
- **Then:** Validation fails, error mentions 'subprocess'
- **Status:** ✅ Passing

##### Test Case 4: Rejects mission with socket import
- **Type:** Integration Test
- **Description:** Prevents network access
- **Given:** Mission with `import socket`
- **When:** validateMission is called
- **Then:** Validation fails, error mentions 'socket'
- **Status:** ✅ Passing

##### Test Case 5: Rejects mission with from...import pattern
- **Type:** Integration Test
- **Description:** Tests alternative import syntax
- **Given:** Mission with `from os import path`
- **When:** validateMission is called
- **Then:** Validation fails for 'os'
- **Status:** ✅ Passing

##### Test Case 6: Rejects mission with non-approved rover commands
- **Type:** Integration Test
- **Description:** Prevents typos and unknown commands
- **Given:** Mission with `rover.hack_mainframe()`
- **When:** validateMission is called
- **Then:** Error mentions 'hack_mainframe'
- **Status:** ✅ Passing

##### Test Case 7: Rejects mission with eval() built-in
- **Type:** Integration Test
- **Description:** Prevents code injection
- **Given:** Mission with `eval()`
- **When:** validateMission is called
- **Then:** Error mentions 'eval'
- **Status:** ✅ Passing

##### Test Case 8: Rejects mission with exec() built-in
- **Type:** Integration Test
- **Description:** Prevents code execution
- **Given:** Mission with `exec()`
- **When:** validateMission is called
- **Then:** Error mentions 'exec'
- **Status:** ✅ Passing

##### Test Case 9: Rejects mission with open() built-in
- **Type:** Integration Test
- **Description:** Prevents file system access
- **Given:** Mission with `open('/etc/passwd')`
- **When:** validateMission is called
- **Then:** Error mentions 'open'
- **Status:** ✅ Passing

##### Test Case 10: Reports multiple violations in single mission
- **Type:** Integration Test
- **Description:** Verifies all issues are caught
- **Given:** Mission with multiple violations
- **When:** validateMission is called
- **Then:** Multiple errors returned
- **Status:** ✅ Passing

##### Test Case 11: Accepts mission with loops and conditionals
- **Type:** Integration Test
- **Description:** Verify legitimate Python constructs work
- **Given:** Mission with for loops and if statements
- **When:** validateMission is called
- **Then:** Validation succeeds
- **Status:** ✅ Passing

##### Test Case 12: Accepts mission with print statements
- **Type:** Integration Test
- **Description:** Verify debugging helpers work
- **Given:** Mission with print statements
- **When:** validateMission is called
- **Then:** Validation succeeds
- **Status:** ✅ Passing

##### Test Case 13: Includes line numbers in error messages
- **Type:** Integration Test
- **Description:** Helps learners locate issues
- **Given:** Mission with violation on specific line
- **When:** validateMission is called
- **Then:** Error includes line number
- **Status:** ✅ Passing

##### Test Case 14: Still enforces schema validation
- **Type:** Integration Test
- **Description:** Verify allowlist doesn't bypass schema checks
- **Given:** Mission missing required fields
- **When:** validateMission is called
- **Then:** Schema validation error (not allowlist error)
- **Status:** ✅ Passing

##### Test Case 15: Rejects empty code
- **Type:** Integration Test
- **Description:** Verify basic validation still works
- **Given:** Mission with empty code string
- **When:** validateMission is called
- **Then:** Error mentions 'empty'
- **Status:** ✅ Passing

---

## User Story 102: Mission Video Viewing and Download

**As a learner I want to view and download my mission video on the platform so that I can see exactly what my code caused the rover to do.**

### Task 107: Unit Tests for VideoPlayer Component

**Test File:** `src/__tests__/unit/video-player.test.tsx`

#### No Video Available

##### Test Case 1: Shows placeholder when no video URLs provided
- **Type:** Unit Test
- **Description:** Displays placeholder message when neither videoUrl nor youtubeUrl provided
- **Given:** VideoPlayer with only missionId prop
- **When:** Component renders
- **Then:** "Video not available yet" message is displayed
- **Status:** ✅ Passing

##### Test Case 2: Displays camera icon in placeholder
- **Type:** Unit Test
- **Description:** Shows SVG camera icon in placeholder state
- **Given:** VideoPlayer with no video URLs
- **When:** Component renders
- **Then:** SVG element is present in DOM
- **Status:** ✅ Passing

#### Direct Video Playback (GCS URL)

##### Test Case 3: Renders video element with GCS URL
- **Type:** Unit Test
- **Description:** Creates HTML5 video element with correct source
- **Given:** VideoPlayer with GCS videoUrl
- **When:** Component renders
- **Then:** Video element has src attribute matching URL and has controls
- **Status:** ✅ Passing

##### Test Case 4: Displays custom title
- **Type:** Unit Test
- **Description:** Shows provided title prop
- **Given:** VideoPlayer with title="My Mission Video"
- **When:** Component renders
- **Then:** Custom title is displayed
- **Status:** ✅ Passing

##### Test Case 5: Displays mission ID
- **Type:** Unit Test
- **Description:** Shows mission ID in component
- **Given:** VideoPlayer with missionId
- **When:** Component renders
- **Then:** Mission ID text is visible
- **Status:** ✅ Passing

##### Test Case 6: Shows download button by default
- **Type:** Unit Test
- **Description:** Download button present when showDownload not specified
- **Given:** VideoPlayer with videoUrl, no showDownload prop
- **When:** Component renders
- **Then:** Download button is in document
- **Status:** ✅ Passing

##### Test Case 7: Hides download button when showDownload is false
- **Type:** Unit Test
- **Description:** Respects showDownload=false prop
- **Given:** VideoPlayer with showDownload={false}
- **When:** Component renders
- **Then:** Download button is not in document
- **Status:** ✅ Passing

##### Test Case 8: Uses default title "Mission Video"
- **Type:** Unit Test
- **Description:** Shows default title when title prop not provided
- **Given:** VideoPlayer without title prop
- **When:** Component renders
- **Then:** "Mission Video" text is displayed
- **Status:** ✅ Passing

#### YouTube Embed

##### Test Case 9: Renders YouTube iframe with video ID from youtube.com URL
- **Type:** Unit Test
- **Description:** Extracts video ID and creates iframe for standard YouTube URL
- **Given:** youtubeUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
- **When:** Component renders
- **Then:** iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"
- **Status:** ✅ Passing

##### Test Case 10: Extracts video ID from youtu.be URL
- **Type:** Unit Test
- **Description:** Handles short YouTube URLs
- **Given:** youtubeUrl="https://youtu.be/dQw4w9WgXcQ"
- **When:** Component renders
- **Then:** iframe with correct embed URL is created
- **Status:** ✅ Passing

##### Test Case 11: Displays link to open in YouTube
- **Type:** Unit Test
- **Description:** Shows external link to YouTube
- **Given:** VideoPlayer with youtubeUrl
- **When:** Component renders
- **Then:** "Open in YouTube →" link present with target="_blank"
- **Status:** ✅ Passing

##### Test Case 12: Prefers YouTube embed over direct video
- **Type:** Unit Test
- **Description:** Uses YouTube when both URLs provided
- **Given:** VideoPlayer with both videoUrl and youtubeUrl
- **When:** Component renders
- **Then:** iframe rendered, video element not rendered
- **Status:** ✅ Passing

##### Test Case 13: Extracts video ID from embed URL
- **Type:** Unit Test
- **Description:** Handles youtube.com/embed/ URLs
- **Given:** youtubeUrl with /embed/ format
- **When:** Component renders
- **Then:** Correct video ID extracted and used
- **Status:** ✅ Passing

#### Component Props

##### Test Case 14: Applies custom className to container
- **Type:** Unit Test
- **Description:** Accepts and applies className prop
- **Given:** VideoPlayer with className="my-custom-class"
- **When:** Component renders
- **Then:** Container div has custom class
- **Status:** ✅ Passing

##### Test Case 15: Accepts and displays custom title prop
- **Type:** Unit Test
- **Description:** Title prop is rendered
- **Given:** VideoPlayer with custom title
- **When:** Component renders
- **Then:** Custom title is displayed
- **Status:** ✅ Passing

##### Test Case 16: Respects showDownload prop
- **Type:** Unit Test
- **Description:** Download button toggles based on prop
- **Given:** VideoPlayer with showDownload toggled
- **When:** Component re-renders
- **Then:** Download button visibility changes accordingly
- **Status:** ✅ Passing

#### Component Structure

##### Test Case 17: Video element has correct attributes
- **Type:** Unit Test
- **Description:** HTML5 video has required attributes
- **Given:** VideoPlayer with videoUrl
- **When:** Component renders
- **Then:** Video has controls and preload="metadata"
- **Status:** ✅ Passing

##### Test Case 18: YouTube iframe has correct attributes
- **Type:** Unit Test
- **Description:** iframe has accessibility and fullscreen attributes
- **Given:** VideoPlayer with youtubeUrl
- **When:** Component renders
- **Then:** iframe has allowFullScreen and title attributes
- **Status:** ✅ Passing

### Task 108: Integration Tests - Video Display

**Test File:** `src/__tests__/integration/video-display.test.ts`

#### Mission Entity Video Fields

##### Test Case 1: Mission entity supports videoUrl field
- **Type:** Integration Test
- **Description:** Verifies Mission entity includes videoUrl field
- **Given:** Mission with videoUrl
- **When:** Mission object is created
- **Then:** videoUrl field is defined and string type
- **Status:** ✅ Passing

##### Test Case 2: Mission entity supports youtubeUrl field
- **Type:** Integration Test
- **Description:** Verifies Mission entity includes youtubeUrl field
- **Given:** Mission with youtubeUrl
- **When:** Mission object is created
- **Then:** youtubeUrl field is defined and string type
- **Status:** ✅ Passing

##### Test Case 3: Mission supports both video fields simultaneously
- **Type:** Integration Test
- **Description:** Mission can have both GCS and YouTube URLs
- **Given:** Mission with both videoUrl and youtubeUrl
- **When:** Mission object is created
- **Then:** Both fields are defined
- **Status:** ✅ Passing

##### Test Case 4: Video fields are optional
- **Type:** Integration Test
- **Description:** Missions don't require video fields
- **Given:** Mission without video fields
- **When:** Mission is queued
- **Then:** Video fields are undefined
- **Status:** ✅ Passing

#### Video URL Validation

##### Test Case 5: Google Cloud Storage URL format is valid
- **Type:** Integration Test
- **Description:** Validates GCS URL format
- **Given:** GCS URL string
- **When:** URL is validated
- **Then:** Matches GCS pattern with .mp4 extension
- **Status:** ✅ Passing

##### Test Case 6: YouTube URL format is valid
- **Type:** Integration Test
- **Description:** Validates standard YouTube URL
- **Given:** YouTube watch URL
- **When:** URL is validated
- **Then:** Matches YouTube watch pattern
- **Status:** ✅ Passing

##### Test Case 7: Short YouTube URL format is valid
- **Type:** Integration Test
- **Description:** Validates youtu.be short URLs
- **Given:** youtu.be URL
- **When:** URL is validated
- **Then:** Matches short URL pattern
- **Status:** ✅ Passing

#### Completed Mission Video Workflow

##### Test Case 8: Completed mission includes video URL
- **Type:** Integration Test
- **Description:** Completed missions have video URLs
- **Given:** Completed mission with all fields
- **When:** Mission status is 'completed'
- **Then:** videoUrl and completedAt are defined
- **Status:** ✅ Passing

##### Test Case 9: Failed mission includes video URL
- **Type:** Integration Test
- **Description:** Failed missions also have video
- **Given:** Failed mission with error
- **When:** Mission status is 'failed'
- **Then:** videoUrl defined, execution result shows failure
- **Status:** ✅ Passing

##### Test Case 10: Queued mission does not have video yet
- **Type:** Integration Test
- **Description:** Queued missions lack video URL
- **Given:** Queued mission with queue position
- **When:** Mission status is 'queued'
- **Then:** videoUrl and completedAt are undefined
- **Status:** ✅ Passing

##### Test Case 11: Processing mission does not have video yet
- **Type:** Integration Test
- **Description:** Processing missions lack video URL
- **Given:** Processing mission with startedAt
- **When:** Mission status is 'processing'
- **Then:** videoUrl and completedAt are undefined
- **Status:** ✅ Passing

#### Video File Types

##### Test Case 12: MP4 video format is supported
- **Type:** Integration Test
- **Description:** Validates MP4 file extension
- **Given:** URL with .mp4 extension
- **When:** URL is checked
- **Then:** Matches .mp4 pattern
- **Status:** ✅ Passing

##### Test Case 13: WebM video format is supported
- **Type:** Integration Test
- **Description:** Validates WebM file extension
- **Given:** URL with .webm extension
- **When:** URL is checked
- **Then:** Matches .webm pattern
- **Status:** ✅ Passing

---

## Test Coverage Summary

| User Story | Tasks | Test Cases | Status |
|------------|-------|------------|--------|
| US 54 | 55-57 | 3 unit | ✅ All Passing |
| US 21 | 22-25 | 35 (20 unit + 15 integration) | ✅ All Passing |
| US 102 | 103-108 | 31 (18 unit + 13 integration) | ✅ All Passing |

**Total Test Results:**
- **114 tests passing** ✅
- **14 tests TODO** (from other scaffolded stories)
- **0 failures** ✅

---

## Test Execution

To run all tests:
```bash
npm test
```

To run specific test file:
```bash
npm test -- src/__tests__/unit/confirmation-response.test.ts
npm test -- src/__tests__/unit/allowlist.test.ts
npm test -- src/__tests__/unit/video-player.test.tsx
npm test -- src/__tests__/integration/unsafe-module-blocked.test.ts
npm test -- src/__tests__/integration/video-display.test.ts
```

---

## Notes

### User Story 54
- All tests use Jest as the test framework
- Unit tests mock the repository layer to isolate business logic
- Queue position calculation assumes 90-second average execution time per mission
- Tests verify both the happy path and edge cases (empty queue, first position)

### User Story 21
- Tests cover 3 security layers: approved commands, blocked imports, dangerous built-ins
- Pattern-based AST analysis (no Python runtime required)
- Both unit tests (isolated logic) and integration tests (full validation pipeline)
- Comprehensive coverage of attack vectors: system access, file I/O, network, code execution
- All error messages include line numbers to help learners
- Tests verify that legitimate Python constructs (loops, conditionals, print) still work
