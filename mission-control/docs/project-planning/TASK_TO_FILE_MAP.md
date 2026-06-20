# Task To File Map

This map links the CSV work items to the scaffolded files in this repo.

Use it as the source of truth for:
- who owns which slice
- which files should be edited for a task
- which tests should move with the implementation

## Working Rule

- `Primary files` are the first files to change for the task.
- `Related files` are the next places that will usually need updates.
- `Tests` are the files that should be implemented or updated in the same branch.
- If two people work in the same `Primary files`, split the task again before coding.

## 10-14: RBAC And Protected Operator Access

### User Story 10
As a system admin I want operators to have a restricted role so that learners cannot access the operator console.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 11 | Define role schema in Firebase custom claims | `src/core/domain/entities/OperatorRole.ts`, `src/infrastructure/auth/operator-claims.ts` | `README.md` | |
| 12 | Implement role-check proxy for protected routes | `src/proxy.ts`, `src/infrastructure/auth/operator-role-check.ts` | `src/app/login/page.tsx`, `src/app/operator/page.tsx` | `src/__tests__/unit/role-check.test.ts` |
| 13 | Unit tests for role-check proxy | `src/__tests__/unit/role-check.test.ts` | `src/proxy.ts`, `src/infrastructure/auth/operator-role-check.ts` | `src/__tests__/unit/role-check.test.ts` |
| 14 | E2E non-operator cannot access operator console | `src/__tests__/e2e/non-operator-access.spec.ts` | `src/proxy.ts`, `src/app/login/page.tsx` | `src/__tests__/e2e/non-operator-access.spec.ts` |

## 17-25: Learner Editor And Command Safety

### User Story 17
As a learner I want to write rover control code in a browser editor so that I can program rover behaviour without a local development environment.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 18 | Integrate Monaco editor | `src/components/mission/RoverEditorScaffold.tsx`, `src/app/mission/page.tsx` | `src/components/mission/MissionWorkspaceScaffold.tsx`, `src/app/globals.css` | `src/__tests__/unit/editor.test.tsx` |
| 19 | Python syntax highlighting and rover autocomplete | `src/components/mission/RoverEditorScaffold.tsx`, `src/infrastructure/sandbox/rover-command-allowlist.ts` | `src/app/mission/page.tsx` | `src/__tests__/unit/editor.test.tsx` |
| 20 | Unit test editor renders and accepts input | `src/__tests__/unit/editor.test.tsx` | `src/components/mission/RoverEditorScaffold.tsx` | `src/__tests__/unit/editor.test.tsx` |

### User Story 21
As a learner I want the editor to restrict available commands to approved rover functions so that I cannot submit unsafe code.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 22 | Define rover command allowlist | `src/infrastructure/sandbox/rover-command-allowlist.ts`, `src/core/application/services/AllowlistService.ts` | `README.md`, `src/components/mission/RoverEditorScaffold.tsx` | `src/__tests__/unit/allowlist.test.ts` |
| 23 | Implement AST-based static analysis | `src/infrastructure/sandbox/ast-allowlist-analyzer.ts`, `src/core/application/services/AllowlistService.ts` | `src/infrastructure/validation/schemas.ts`, `src/app/api/missions/route.ts` | `src/__tests__/unit/allowlist.test.ts`, `src/__tests__/integration/unsafe-module-blocked.test.ts` |
| 24 | Unit tests for allowlist enforcement | `src/__tests__/unit/allowlist.test.ts` | `src/infrastructure/sandbox/ast-allowlist-analyzer.ts` | `src/__tests__/unit/allowlist.test.ts` |
| 25 | Integration test unsafe imports blocked | `src/__tests__/integration/unsafe-module-blocked.test.ts` | `src/app/api/missions/route.ts`, `src/infrastructure/validation/schemas.ts` | `src/__tests__/integration/unsafe-module-blocked.test.ts` |

## 27-32: Browser Simulator

### User Story 27
As a learner I want to run my program in a browser-based rover simulator before sending it to the real rover.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 28 | Implement simulator canvas | `src/components/mission/RoverSimulatorScaffold.tsx`, `src/app/mission/page.tsx` | `src/components/mission/MissionWorkspaceScaffold.tsx`, `src/app/globals.css` | |
| 29 | Implement rover movement state machine | `src/infrastructure/simulator/rover-movement.ts` | `src/infrastructure/simulator/simulator-executor.ts` | `src/__tests__/unit/rover-movement.test.ts` |
| 30 | Connect Run button to simulator execution engine | `src/infrastructure/simulator/simulator-executor.ts`, `src/components/mission/RoverEditorScaffold.tsx`, `src/components/mission/RoverSimulatorScaffold.tsx` | `src/app/mission/page.tsx` | `src/__tests__/integration/simulator-execution.test.ts` |
| 31 | Unit tests for movement calculations | `src/__tests__/unit/rover-movement.test.ts` | `src/infrastructure/simulator/rover-movement.ts` | `src/__tests__/unit/rover-movement.test.ts` |
| 32 | Integration test simulator updates state | `src/__tests__/integration/simulator-execution.test.ts` | `src/infrastructure/simulator/simulator-executor.ts`, `src/components/mission/RoverEditorScaffold.tsx` | `src/__tests__/integration/simulator-execution.test.ts` |

## 35-61: Mission Submission, Queue Feedback, And Learner Notifications

### User Story 35
As a learner I want to submit my code as a mission to the cloud queue without an account.

Status: core implementation already exists. Extend these files rather than replacing them.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 36 | POST /missions endpoint | `src/app/api/missions/route.ts` | `src/core/application/services/MissionService.ts`, `src/infrastructure/persistence/FirestoreMissionRepository.ts` | `src/__tests__/integration/missions.api.test.ts` |
| 37 | Mission schema validation | `src/infrastructure/validation/schemas.ts` | `src/app/api/missions/route.ts`, `src/core/domain/entities/Mission.ts` | `src/__tests__/unit/validation.test.ts` |
| 38 | Anonymous submission | `src/app/api/missions/route.ts`, `src/core/application/services/MissionService.ts` | `src/app/mission/page.tsx` | `src/__tests__/unit/MissionService.test.ts` |
| 39 | Validation unit tests | `src/__tests__/unit/validation.test.ts` | `src/infrastructure/validation/schemas.ts` | `src/__tests__/unit/validation.test.ts` |
| 40 | Valid submission integration test | `src/__tests__/integration/missions.api.test.ts` | `src/app/api/missions/route.ts` | `src/__tests__/integration/missions.api.test.ts` |
| 41 | Invalid code rejected integration test | `src/__tests__/integration/missions.api.test.ts` | `src/infrastructure/validation/schemas.ts` | `src/__tests__/integration/missions.api.test.ts` |

### User Story 54
As a learner I want confirmation with my queue position when my mission is accepted.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 55 | Include queue position and estimated wait in POST response | `src/core/application/services/MissionService.ts`, `src/infrastructure/persistence/FirestoreMissionRepository.ts`, `src/app/api/missions/route.ts` | `src/components/mission/MissionStatusScaffold.tsx` | `src/__tests__/unit/confirmation-response.test.ts` |
| 56 | GET /missions/{mission_id}/status | `src/app/api/missions/[missionId]/status/route.ts`, `src/core/application/services/MissionStatusService.ts` | `src/app/missions/[missionId]/page.tsx`, `src/app/history/page.tsx`, `src/components/mission/MissionStatusScaffold.tsx` | |
| 57 | Unit test confirmation response includes queue position | `src/__tests__/unit/confirmation-response.test.ts` | `src/core/application/services/MissionService.ts`, `src/infrastructure/persistence/FirestoreMissionRepository.ts` | `src/__tests__/unit/confirmation-response.test.ts` |

### User Story 58
As a learner I want a notification when my mission has completed.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 59 | Mission completion event trigger in dispatcher | `src/core/application/services/MissionNotificationService.ts`, `src/core/application/services/GroundStationDispatchService.ts` | `src/app/api/missions/[missionId]/status/route.ts` | `src/__tests__/integration/completion-notification.test.ts` |
| 60 | Optional email notification | `src/infrastructure/notifications/MissionCompletionNotifier.ts`, `src/core/application/services/MissionNotificationService.ts` | `src/components/mission/MissionStatusScaffold.tsx`, `src/components/mission/MissionHistoryScaffold.tsx` | `src/__tests__/integration/completion-notification.test.ts` |
| 61 | Integration test completion notification | `src/__tests__/integration/completion-notification.test.ts` | `src/core/application/services/MissionNotificationService.ts`, `src/infrastructure/notifications/MissionCompletionNotifier.ts` | `src/__tests__/integration/completion-notification.test.ts` |

## 43-52: Queue Visibility And Yard Maintenance

### User Story 43
As an operator I want to see the live mission queue for my yard.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 44 | Redis queue infrastructure | `src/infrastructure/queue/RedisQueueGateway.ts` | `src/core/application/services/QueueService.ts` | |
| 45 | GET /queue/{yard_id} | `src/app/api/queue/[yardId]/route.ts`, `src/core/application/services/QueueService.ts` | `src/app/operator/page.tsx`, `src/components/operator/QueueListScaffold.tsx` | `src/__tests__/unit/queue-ordering.test.ts`, `src/__tests__/integration/queue-order.test.ts` |
| 46 | Unit tests for FIFO logic | `src/__tests__/unit/queue-ordering.test.ts` | `src/core/application/services/QueueService.ts`, `src/infrastructure/persistence/FirestoreMissionRepository.ts` | `src/__tests__/unit/queue-ordering.test.ts` |
| 47 | Integration test queue order | `src/__tests__/integration/queue-order.test.ts` | `src/app/api/queue/[yardId]/route.ts`, `src/app/api/missions/route.ts` | `src/__tests__/integration/queue-order.test.ts` |

### User Story 48
As an operator I want to set the yard to Maintenance Mode.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 49 | Maintenance mode flag per yard | `src/infrastructure/yard/RedisYardStatusGateway.ts`, `src/core/domain/entities/Yard.ts` | `src/core/application/services/YardStatusService.ts` | |
| 50 | PATCH /yard/{yard_id}/status | `src/app/api/yard/[yardId]/status/route.ts`, `src/core/application/services/YardStatusService.ts` | `src/components/operator/YardControlScaffold.tsx`, `src/proxy.ts` | `src/__tests__/unit/maintenance-mode.test.ts` |
| 51 | Block mission dispatch in maintenance mode | `src/core/application/services/YardStatusService.ts`, `src/core/application/services/GroundStationDispatchService.ts` | `src/app/api/missions/route.ts`, `src/app/api/operator/missions/[missionId]/route.ts` | `src/__tests__/unit/maintenance-mode.test.ts` |
| 52 | Unit tests missions blocked in maintenance mode | `src/__tests__/unit/maintenance-mode.test.ts` | `src/core/application/services/YardStatusService.ts`, `src/core/application/services/GroundStationDispatchService.ts` | `src/__tests__/unit/maintenance-mode.test.ts` |

## 64-76: Ground Station Delivery And Physical Execution

### User Story 64
As the rover system I want to receive mission scripts from the Ground Station Agent via a reliable cloud connection.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 65 | WebSocket server endpoint on Cloud Run | `src/infrastructure/websocket/CloudRunMissionSocketServer.ts`, `src/core/application/services/GroundStationDispatchService.ts` | `src/app/api/operator/missions/[missionId]/route.ts` | `src/__tests__/integration/websocket-delivery.test.ts` |
| 66 | WebSocket client on Raspberry Pi | `src/infrastructure/gsa/GroundStationClient.ts` | `src/core/application/services/GroundStationDispatchService.ts` | |
| 67 | Reconnection logic with heartbeat | `src/infrastructure/gsa/ReconnectionPolicy.ts`, `src/infrastructure/gsa/GroundStationClient.ts` | `src/core/application/services/GroundStationDispatchService.ts` | `src/__tests__/unit/heartbeat.test.ts` |
| 68 | Unit test heartbeat detects disconnection | `src/__tests__/unit/heartbeat.test.ts` | `src/infrastructure/gsa/ReconnectionPolicy.ts`, `src/infrastructure/gsa/GroundStationClient.ts` | `src/__tests__/unit/heartbeat.test.ts` |
| 69 | Integration test mission delivered over WebSocket | `src/__tests__/integration/websocket-delivery.test.ts` | `src/infrastructure/websocket/CloudRunMissionSocketServer.ts`, `src/infrastructure/gsa/GroundStationClient.ts` | `src/__tests__/integration/websocket-delivery.test.ts` |

### User Story 71
As the rover system I want to execute the received mission script on the physical rover.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 72 | Sandboxed Python execution on Pi | `src/infrastructure/gsa/SandboxedPythonExecutor.ts` | `src/infrastructure/sandbox/rover-command-allowlist.ts`, `src/core/application/services/GroundStationDispatchService.ts` | `src/__tests__/unit/sandbox-disallowed-commands.test.ts` |
| 73 | Map rover commands to hardware calls | `src/infrastructure/gsa/RoverHardwareAdapter.ts` | `src/infrastructure/gsa/SandboxedPythonExecutor.ts` | |
| 74 | Execution timeout guard | `src/infrastructure/gsa/ExecutionTimeoutGuard.ts`, `src/infrastructure/gsa/SandboxedPythonExecutor.ts` | `src/core/application/services/GroundStationDispatchService.ts` | `src/__tests__/unit/execution-timeout.test.ts` |
| 75 | Unit tests execution timeout | `src/__tests__/unit/execution-timeout.test.ts` | `src/infrastructure/gsa/ExecutionTimeoutGuard.ts` | `src/__tests__/unit/execution-timeout.test.ts` |
| 76 | Unit tests disallowed commands in sandbox | `src/__tests__/unit/sandbox-disallowed-commands.test.ts` | `src/infrastructure/gsa/SandboxedPythonExecutor.ts`, `src/infrastructure/sandbox/rover-command-allowlist.ts` | `src/__tests__/unit/sandbox-disallowed-commands.test.ts` |

## 77-86: Emergency Stop And Operator Console

### User Story 77
As an operator I want to trigger an emergency stop at any time.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 78 | Implement e-stop signal handler on GSA | `src/infrastructure/gsa/EmergencyStopSignal.ts` | `src/core/application/services/GroundStationDispatchService.ts`, `src/infrastructure/gsa/RoverHardwareAdapter.ts` | `src/__tests__/unit/emergency-stop.test.ts` |
| 79 | Add e-stop button to operator console UI | `src/components/operator/EStopButtonScaffold.tsx`, `src/app/operator/page.tsx` | `src/components/operator/OperatorConsoleScaffold.tsx`, `src/app/api/operator/missions/[missionId]/route.ts` | `src/__tests__/unit/emergency-stop.test.ts` |
| 80 | Unit test e-stop halts execution | `src/__tests__/unit/emergency-stop.test.ts` | `src/infrastructure/gsa/EmergencyStopSignal.ts` | `src/__tests__/unit/emergency-stop.test.ts` |

### User Story 82
As an operator I want to log in and manage the mission queue from a console.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 83 | Build operator console UI | `src/app/operator/page.tsx`, `src/components/operator/OperatorConsoleScaffold.tsx`, `src/components/operator/QueueListScaffold.tsx` | `src/components/operator/YardControlScaffold.tsx`, `src/app/login/page.tsx` | |
| 84 | Execute, skip, and hold queue actions | `src/app/api/operator/missions/[missionId]/route.ts`, `src/core/application/services/QueueActionService.ts`, `src/core/domain/entities/QueueAction.ts` | `src/components/operator/QueueListScaffold.tsx`, `src/core/application/services/GroundStationDispatchService.ts` | `src/__tests__/unit/queue-actions.test.ts`, `src/__tests__/e2e/operator-executes-mission.spec.ts` |
| 85 | Unit test queue actions | `src/__tests__/unit/queue-actions.test.ts` | `src/core/application/services/QueueActionService.ts`, `src/app/api/operator/missions/[missionId]/route.ts` | `src/__tests__/unit/queue-actions.test.ts` |
| 86 | E2E operator executes mission | `src/__tests__/e2e/operator-executes-mission.spec.ts` | `src/app/operator/page.tsx`, `src/app/api/operator/missions/[missionId]/route.ts` | `src/__tests__/e2e/operator-executes-mission.spec.ts` |

## 102-108: Mission Video Viewing and Download

### User Story 102
As a learner I want to view and download my mission video on the platform so that I can see exactly what my code caused the rover to do.

| ID | Task | Primary files | Related files | Tests |
| --- | --- | --- | --- | --- |
| 103 | Create VideoPlayer component | `src/components/mission/VideoPlayer.tsx` | `src/core/domain/entities/Mission.ts` | `src/__tests__/unit/video-player.test.tsx` |
| 104 | Integrate video into MissionStatusScaffold | `src/components/mission/MissionStatusScaffold.tsx` | `src/components/mission/VideoPlayer.tsx`, `src/app/missions/[missionId]/page.tsx` | |
| 105 | Integrate video into MissionHistoryScaffold | `src/components/mission/MissionHistoryScaffold.tsx`, `src/app/history/page.tsx` | `src/components/mission/VideoPlayer.tsx`, `src/core/application/services/MissionService.ts` | |
| 106 | Add video download functionality | `src/components/mission/VideoPlayer.tsx` | | |
| 107 | Unit tests for VideoPlayer component | `src/__tests__/unit/video-player.test.tsx` | `src/components/mission/VideoPlayer.tsx` | `src/__tests__/unit/video-player.test.tsx` |
| 108 | Integration test for video display in completed missions | `src/__tests__/integration/video-display.test.ts` | `src/components/mission/MissionStatusScaffold.tsx`, `src/components/mission/MissionHistoryScaffold.tsx` | `src/__tests__/integration/video-display.test.ts` |

## Suggested Parallel Team Split

Use these as non-overlapping ownership lanes:

| Lane | Scope | Main files |
| --- | --- | --- |
| Lane A | RBAC, login, operator access | `src/proxy.ts`, `src/app/login/*`, `src/infrastructure/auth/*`, `src/__tests__/unit/role-check.test.ts`, `src/__tests__/e2e/non-operator-access.spec.ts` |
| Lane B | Learner editor, allowlist, simulator | `src/app/mission/*`, `src/components/mission/RoverEditorScaffold.tsx`, `src/components/mission/RoverSimulatorScaffold.tsx`, `src/infrastructure/sandbox/*`, `src/infrastructure/simulator/*`, related editor/simulator tests |
| Lane C | Mission APIs, learner polling, notifications | `src/app/api/missions/*`, `src/app/history/*`, `src/app/missions/[missionId]/*`, `src/core/application/services/Mission*.ts`, `src/infrastructure/notifications/*`, mission and notification tests |
| Lane D | Queue, maintenance mode, operator console actions | `src/app/api/queue/*`, `src/app/api/yard/*`, `src/app/api/operator/*`, `src/components/operator/*`, `src/core/application/services/Queue*.ts`, `src/core/application/services/YardStatusService.ts`, queue and maintenance tests |
| Lane E | GSA, WebSocket, hardware execution, e-stop | `src/infrastructure/websocket/*`, `src/infrastructure/gsa/*`, `src/core/application/services/GroundStationDispatchService.ts`, heartbeat/timeout/e-stop/websocket tests |

## Notes

- Tasks 36-41 are already partly implemented. Extend them rather than rebuilding them.
- `proxy.ts` is the correct Next.js 16 entry point for request interception in this repo.
- Avoid editing `.env`, `.env.local`, or downloaded service-account JSON in feature branches.
