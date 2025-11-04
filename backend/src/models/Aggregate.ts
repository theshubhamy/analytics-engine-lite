import mongoose from 'mongoose';

const HourlyAggregateSchema = new mongoose.Schema({
  hour: { type: Date, unique: true },
  pageViews: { type: Object, default: {} },
  actions: { type: Object, default: {} },
  perf: { type: Object, default: {} },
});

const DailyAggregateSchema = new mongoose.Schema({
  day: { type: Date, unique: true },
  pageViews: { type: Object, default: {} },
  actions: { type: Object, default: {} },
  perf: { type: Object, default: {} },
});

export const HourlyAggregate = mongoose.model(
  'HourlyAggregate',
  HourlyAggregateSchema,
);
export const DailyAggregate = mongoose.model(
  'DailyAggregate',
  DailyAggregateSchema,
);
