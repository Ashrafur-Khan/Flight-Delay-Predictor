## Current v1 dataset note

The current v1 backend model is trained from the BTS `Airline_Delay_Cause.csv` export stored in `backend/data/`.

This is a viable v1 path because the BTS export already contains the fields needed by the repo's cleaning and training pipeline. The trained backend artifact is therefore BTS-backed, but the API still scores traveler-facing requests through a proxy feature-adaptation layer rather than through direct flight-level traveler inputs.

For v1, this is acceptable as a working backend model. A more suitable dataset or a more traveler-native feature set should be treated as post-v1 improvement work.
