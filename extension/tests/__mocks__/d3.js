// extension/tests/__mocks__/d3.js
export const d3 = {
    // Selection
    select: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      classed: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      html: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      call: jest.fn().mockReturnThis(),
      node: jest.fn().mockReturnValue(document.createElement('div')),
      nodes: jest.fn().mockReturnValue([document.createElement('div')])
    }),
    selectAll: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      classed: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      html: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      call: jest.fn().mockReturnThis(),
      nodes: jest.fn().mockReturnValue([document.createElement('div')])
    }),
  
    // Scales
    scaleLinear: jest.fn().mockReturnValue({
      domain: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      nice: jest.fn().mockReturnThis(),
      ticks: jest.fn().mockReturnValue([0, 1, 2, 3, 4, 5])
    }),
    scaleTime: jest.fn().mockReturnValue({
      domain: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      nice: jest.fn().mockReturnThis(),
      ticks: jest.fn().mockReturnValue([new Date(), new Date()])
    }),
  
    // Axes
    axisBottom: jest.fn().mockReturnValue({
      scale: jest.fn().mockReturnThis(),
      tickFormat: jest.fn().mockReturnThis(),
      tickSize: jest.fn().mockReturnThis(),
      tickPadding: jest.fn().mockReturnThis()
    }),
    axisLeft: jest.fn().mockReturnValue({
      scale: jest.fn().mockReturnThis(),
      tickFormat: jest.fn().mockReturnThis(),
      tickSize: jest.fn().mockReturnThis(),
      tickPadding: jest.fn().mockReturnThis()
    }),
  
    // Transitions
    transition: jest.fn().mockReturnValue({
      duration: jest.fn().mockReturnThis(),
      delay: jest.fn().mockReturnThis(),
      ease: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis()
    }),
  
    // Easing
    easeLinear: jest.fn(),
    easeQuad: jest.fn(),
    easeCubic: jest.fn(),
  
    // Arrays
    extent: jest.fn().mockReturnValue([0, 100]),
    min: jest.fn().mockReturnValue(0),
    max: jest.fn().mockReturnValue(100),
    sum: jest.fn().mockReturnValue(100),
    mean: jest.fn().mockReturnValue(50),
  
    // Formatting
    format: jest.fn().mockReturnValue((d) => d.toString()),
    timeFormat: jest.fn().mockReturnValue((d) => d.toString()),
  
    // Colors
    color: jest.fn().mockReturnValue({
      brighter: jest.fn().mockReturnThis(),
      darker: jest.fn().mockReturnThis(),
      toString: jest.fn().mockReturnValue('#000000')
    }),
    rgb: jest.fn().mockReturnValue({
      brighter: jest.fn().mockReturnThis(),
      darker: jest.fn().mockReturnThis(),
      toString: jest.fn().mockReturnValue('rgb(0,0,0)')
    }),
  
    // Reset function for tests
    __reset: function() {
      Object.values(this).forEach(value => {
        if (typeof value === 'function' && value.mockReset) {
          value.mockReset();
        }
      });
    }
  };
  
  export default d3;