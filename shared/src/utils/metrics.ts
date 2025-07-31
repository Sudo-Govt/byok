export interface MetricEvent {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface Counter {
  increment(value?: number): void;
  decrement(value?: number): void;
  getValue(): number;
}

export interface Gauge {
  set(value: number): void;
  getValue(): number;
}

export interface Histogram {
  record(value: number): void;
  getCount(): number;
  getSum(): number;
  getAverage(): number;
}

class InMemoryCounter implements Counter {
  private value = 0;

  increment(value = 1): void {
    this.value += value;
  }

  decrement(value = 1): void {
    this.value -= value;
  }

  getValue(): number {
    return this.value;
  }
}

class InMemoryGauge implements Gauge {
  private value = 0;

  set(value: number): void {
    this.value = value;
  }

  getValue(): number {
    return this.value;
  }
}

class InMemoryHistogram implements Histogram {
  private values: number[] = [];

  record(value: number): void {
    this.values.push(value);
  }

  getCount(): number {
    return this.values.length;
  }

  getSum(): number {
    return this.values.reduce((sum, val) => sum + val, 0);
  }

  getAverage(): number {
    return this.values.length > 0 ? this.getSum() / this.getCount() : 0;
  }
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  private constructor() {}

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  public counter(name: string): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new InMemoryCounter());
    }
    return this.counters.get(name)!;
  }

  public gauge(name: string): Gauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new InMemoryGauge());
    }
    return this.gauges.get(name)!;
  }

  public histogram(name: string): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new InMemoryHistogram());
    }
    return this.histograms.get(name)!;
  }

  public getAllMetrics(): { counters: Map<string, number>; gauges: Map<string, number>; histograms: Map<string, { count: number; sum: number; average: number }> } {
    const counterValues = new Map<string, number>();
    this.counters.forEach((counter, name) => {
      counterValues.set(name, counter.getValue());
    });

    const gaugeValues = new Map<string, number>();
    this.gauges.forEach((gauge, name) => {
      gaugeValues.set(name, gauge.getValue());
    });

    const histogramValues = new Map<string, { count: number; sum: number; average: number }>();
    this.histograms.forEach((histogram, name) => {
      histogramValues.set(name, {
        count: histogram.getCount(),
        sum: histogram.getSum(),
        average: histogram.getAverage()
      });
    });

    return {
      counters: counterValues,
      gauges: gaugeValues,
      histograms: histogramValues
    };
  }
}

export const metrics = MetricsCollector.getInstance();