CREATE TABLE `commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`strategyId` text,
	`by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_equity` (
	`date` text PRIMARY KEY NOT NULL,
	`equity` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equity_samples` (
	`at` text PRIMARY KEY NOT NULL,
	`equity` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`clientOrderId` text NOT NULL,
	`strategyId` text,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`qty` real NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`filledQty` real NOT NULL,
	`filledAvgPrice` real,
	`submittedAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_submitted_at` ON `orders` (`submittedAt`);--> statement-breakpoint
CREATE TABLE `status` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`heartbeatAt` text NOT NULL,
	`commandCursor` integer NOT NULL,
	`account` text NOT NULL,
	`market` text NOT NULL,
	`positions` text NOT NULL,
	`strategies` text NOT NULL,
	`limits` text NOT NULL,
	`health` text NOT NULL
);
