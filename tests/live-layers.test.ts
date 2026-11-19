import {describe, expect, it} from 'vitest';
import {addDays, ago, glofasDay, glofasDefaults, lastFromDomain, rainTime} from '../src/lib/live-layers';

describe('live layer times', () => {
  it('reads the newest value from WMTS DescribeDomains', () => {
    expect(lastFromDomain('<Domains><DimensionDomain><Domain>2026-11-18/2026-11-19T02:30:00Z/PT30M</Domain></DimensionDomain></Domains>')).toBe('2026-11-19T02:30:00Z');
    expect(lastFromDomain('<Domain>2026-11-10/2026-11-19/P1D</Domain>')).toBe('2026-11-19');
    expect(lastFromDomain('<Domain>2026-11-01,2026-11-05</Domain>')).toBe('2026-11-05');
    expect(lastFromDomain('<nothing/>')).toBeNull();
  });
  it('reads default times from GloFAS capabilities', () => {
    const caps = `<Layer><Name>FloodSummary1_30</Name><Title>x</Title><Dimension name="time" units="ISO8601" default="2026-11-18T00:00Z">2011-01-01/2026-11-18/PT24H</Dimension></Layer>`;
    expect(glofasDefaults(caps, ['FloodSummary1_30', 'missing'])).toEqual({FloodSummary1_30: '2026-11-18T00:00Z', missing: null});
  });
  it('steps rain back in half hours and formats GloFAS days', () => {
    expect(rainTime('2026-11-19T02:30:00Z', 3)).toBe('2026-11-19T01:00:00Z');
    expect(glofasDay('2026-11-18T00:00Z')).toBe('2026-11-18T00:00:00');
    expect(addDays('2026-11-01', -2)).toBe('2026-10-30');
  });
  it('says how old something is', () => {
    const now = Date.parse('2026-11-19T08:00:00Z');
    expect(ago('2026-11-18T00:04:00Z', false, now)).toBe('about 32 hours ago');
    expect(ago('2026-11-19T07:30:00Z', false, now)).toBe('less than an hour ago');
    expect(ago('2026-11-15T08:00:00Z', false, now)).toBe('about 4 days ago');
  });
});
