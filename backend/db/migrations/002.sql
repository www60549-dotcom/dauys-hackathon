CREATE TABLE appeal_impact (
 appeal_id text PRIMARY KEY REFERENCES appeals(id),
 people integer NOT NULL CHECK(people BETWEEN 1 AND 100000),
 minutes double precision NOT NULL CHECK(minutes>=0 AND minutes<=1440),
 occurrences_month double precision NOT NULL CHECK(occurrences_month>=0 AND occurrences_month<=1000),
 hourly_rate double precision NOT NULL CHECK(hourly_rate>=0 AND hourly_rate<=1000000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pilot_experiments (
 id bigserial PRIMARY KEY, appeal_id text NOT NULL REFERENCES appeals(id),
 hypothesis text NOT NULL, scope text NOT NULL, metric text NOT NULL, unit text NOT NULL,
 baseline double precision NOT NULL CHECK(baseline>=0), target double precision NOT NULL CHECK(target>=0),
 actual double precision CHECK(actual>=0), direction text NOT NULL CHECK(direction IN ('decrease','increase')),
 owner_id text NOT NULL REFERENCES users(id), end_at date NOT NULL,
 state text NOT NULL CHECK(state IN ('planned','running','evaluated')),
 conclusion text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, evaluated_at timestamptz
);
CREATE INDEX pilot_appeal ON pilot_experiments(appeal_id,id DESC);
CREATE UNIQUE INDEX pilot_one_active ON pilot_experiments(appeal_id) WHERE state IN ('planned','running');
CREATE TABLE appeal_recurrences (
 id bigserial PRIMARY KEY,appeal_id text NOT NULL REFERENCES appeals(id),author_id text NOT NULL REFERENCES users(id),
 reason text NOT NULL, previous_result text NOT NULL, previous_effect integer NOT NULL,
 previous_confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recurrence_appeal ON appeal_recurrences(appeal_id,created_at DESC);
