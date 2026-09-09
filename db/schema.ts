import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const state=sqliteTable('state',{id:integer('id').primaryKey(),revision:integer('revision').notNull().default(0),cue:text('cue'),mode:text('mode').notNull().default('animate'),updated:integer('updated').notNull().default(0)});
export const commands=sqliteTable('commands',{id:text('id').primaryKey(),action:text('action').notNull(),cue:text('cue'),processed:integer('processed').notNull().default(0),created:integer('created').notNull()});
export const renderers=sqliteTable('renderers',{id:text('id').primaryKey(),revision:integer('revision').notNull(),cue:text('cue'),phase:text('phase').notNull(),seen:integer('seen').notNull()});
export const controllers=sqliteTable('controllers',{id:text('id').primaryKey(),sequence:integer('sequence').notNull()});
