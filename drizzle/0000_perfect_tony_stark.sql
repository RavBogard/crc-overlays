CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`cue` text,
	`processed` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `renderers` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`cue` text,
	`phase` text NOT NULL,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`cue` text,
	`mode` text DEFAULT 'animate' NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL
);
