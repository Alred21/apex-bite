# Iteration 2 tickets

The canonical specification and ticket acceptance criteria live in GitHub: [specification #8](https://github.com/Alred21/apex-bite/issues/8) and its 13 native sub-issues below. Every child is labeled `ready-for-agent`; dependencies are native GitHub blocking relationships. This index replaces the approved draft breakdown rather than duplicating issue bodies.

| Ticket | Delivery | Blocked by |
| --- | --- | --- |
| [#9](https://github.com/Alred21/apex-bite/issues/9) | Preserve training records across handling revisions | — |
| [#10](https://github.com/Alred21/apex-bite/issues/10) | Drive a progressive, grip-limited electric Kart | #9 |
| [#11](https://github.com/Alred21/apex-bite/issues/11) | Place the Kart precisely with keyboard controls | #10 |
| [#12](https://github.com/Alred21/apex-bite/issues/12) | Complete a 12-lap Time Trial and review results | — |
| [#13](https://github.com/Alred21/apex-bite/issues/13) | Follow an executable Reference Lap and Ghost Kart | #10 |
| [#14](https://github.com/Alred21/apex-bite/issues/14) | Improve the Reference Lap across connected Turns | #13 |
| [#15](https://github.com/Alred21/apex-bite/issues/15) | Receive pose-aware Racing Line cues and choose display modes | #13 |
| [#16](https://github.com/Alred21/apex-bite/issues/16) | Practice Corner Drills against evidence-based reference targets | #13 |
| [#17](https://github.com/Alred21/apex-bite/issues/17) | Drive a detailed and correctly animated rental Kart | — |
| [#18](https://github.com/Alred21/apex-bite/issues/18) | Drive inside a believable venue with adjustable graphics quality | — |
| [#19](https://github.com/Alred21/apex-bite/issues/19) | Hear responsive electric, tire, and Barrier-contact audio | — |
| [#20](https://github.com/Alred21/apex-bite/issues/20) | Tune comfortable Helmet Cam and Chase Cam feedback | — |
| [#21](https://github.com/Alred21/apex-bite/issues/21) | Deliver a smooth, consistent complete training session | #11, #12, #14–#20 |

Implementation uses one integration branch with a separate branch/worktree per implementer and follows the available frontier. Each slice includes its own public-session behavior tests and relevant browser checks; #21 covers final integrated behavior and measured performance rather than deferring earlier tickets' checks. The parent specification's body and status remain unchanged during ticket publication.
