import { ViewMode } from './NetworkSettings'
import { getColorsForLabels } from '../labelPropagation'

export const NodePrimaryColor = '#f50057'
export const NodeSecondaryColor = '#999999'

// Mapping of mode => function for applying graph coloring
const GraphColorerByMode = {
  // Actual coloring for label mode
  [ViewMode.label]: ({ labels, cy }) => {
    const colorsByLabel = getColorsForLabels(labels)

    // Generate selectors for each label
    const selectors = Array.from(colorsByLabel.entries()).map(([label, color]) => ({
      selector: `node[label = "${label}"]`,
      style: {
        'background-color': `#${color}`,
      },
    }))

    // Apply generated style with label selectors
    cy.style([
      {
        selector: 'node',
        style: {
          "width": "mapData(score, 0, 1, 60, 180)",
          "height": "mapData(score, 0, 1, 60, 180)",
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
        },
      },
      ...selectors,
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])
  },

  // TODO: replace with actual "periphery" coloring
  // Currently using label coloring
  [ViewMode.periphery]: ({ labels, cy }) => {
    const colorsByLabel = getColorsForLabels(labels)

    // Generate selectors for each label
    const selectors = Array.from(colorsByLabel.entries()).map(([label, color]) => ({
      selector: `node[label = "${label}"]`,
      style: {
        'background-color': `#${color}`,
      },
    }))

    // Apply generated style with label selectors
    cy.style([
      {
        selector: 'node',
        style: {
          "width": "mapData(score, 0, 1, 60, 180)",
          "height": "mapData(score, 0, 1, 60, 180)",
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
        },
      },
      ...selectors,
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])
  },

  // TODO: replace with actual "center" coloring
  // Currently using label coloring
  [ViewMode.center]: ({ labels, cy }) => {
    const colorsByLabel = getColorsForLabels(labels)

    // Generate selectors for each label
    const selectors = Array.from(colorsByLabel.entries()).map(([label, color]) => ({
      selector: `node[label = "${label}"]`,
      style: {
        'background-color': `#${color}`,
      },
    }))

    // Apply generated style with label selectors
    cy.style([
      {
        selector: 'node',
        style: {
          "width": "mapData(score, 0, 1, 60, 180)",
          "height": "mapData(score, 0, 1, 60, 180)",
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
        },
      },
      ...selectors,
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])
  },
}

export default GraphColorerByMode
