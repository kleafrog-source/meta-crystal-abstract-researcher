# Catalogue authority

The published AM Parameters Catalogue is the sole source of parameter membership for retrieval and parameter indexes. A row becomes authoritative after it is committed through the catalogue queue. Exclusions and catalogue deletion tombstones are applied to that published library.

Historical Genesis snapshots and their runtime atom corpora remain separate research inputs. They may contribute atom expansion where an atom index is available, but they do not add parameter rows to catalogue retrieval or override the published catalogue. Legacy `v3` directory and API identifiers are implementation names, not a second dataset authority.

Index status is an on-demand audit of local manifests and fingerprints. Opening Engine or another mode must not rebuild an index or load a model. All full index builds are started and stopped from `/service-bay`.
