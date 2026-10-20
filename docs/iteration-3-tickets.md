# Iteration 3 tickets

The approved specification and ticket acceptance criteria are published in GitHub: [specification #23](https://github.com/Alred21/apex-bite/issues/23) and its seven native sub-issues below. All eight issues are labeled ready-for-agent; blocking relationships are native GitHub dependencies.

| Ticket | Delivery | Blocked by |
| --- | --- | --- |
| [#24](https://github.com/Alred21/apex-bite/issues/24) | Recover from mistakes with progressive Brake/Reverse | None |
| [#25](https://github.com/Alred21/apex-bite/issues/25) | Choose comfortable keyboard driving bindings | #24 |
| [#26](https://github.com/Alred21/apex-bite/issues/26) | Drive with a correctly seated driver in both camera views | None |
| [#27](https://github.com/Alred21/apex-bite/issues/27) | Practice a hairpin against an executable movable Apex | None |
| [#28](https://github.com/Alred21/apex-bite/issues/28) | Follow a faster Racing Line across the complete Circuit | #27 |
| [#29](https://github.com/Alred21/apex-bite/issues/29) | Read translucent Racing Line cues driven by live speed | #24 |
| [#30](https://github.com/Alred21/apex-bite/issues/30) | Verify the complete iteration-3 training experience | #25, #26, #28, #29 |

The starting frontier is #24, #26, #27. Each slice owns its behavior tests and relevant browser checks. The final integration ticket verifies the complete experience and measured performance. Transitive blockers are omitted.

The user confirmed the public SimulationSession as the primary behavior seam, plus existing real-browser harnesses for controls, HUD/focus, cameras, and rendering. No new general test framework or standalone prefactoring ticket is required.

The accepted design and full specification remain available in the adjacent iteration-3 design and spec documents. Individual local ticket files mirror the published bodies; canonical acceptance criteria and dependencies live in GitHub. Parent specification body and state were preserved during ticket creation.
