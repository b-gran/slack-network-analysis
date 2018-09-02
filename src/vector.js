import assert from 'assert'

// Converts a node to an N-dimensional vector, where N is the
// number of vertices in the graph.
export function toVector (node, canonicalNodeIdArray) {
  const connectedNodesCollection = node.neighborhood().nodes()

  const connectedNodeIds = new Set()
  connectedNodesCollection.forEach(connectedNode => {
    connectedNodeIds.add(connectedNode.data('id'))
  })

  return canonicalNodeIdArray.map(nodeId => connectedNodeIds.has(nodeId) ? 1 : 0)
}

// Get an Array of node ids from a cytoscape graph for use with toVector()
export function getNodeIdArray (nodes) {
  return nodes.toArray().map(node => node.data('id'))
}

export function graphToVectors (nodes) {
  const canonicalNodeIds = getNodeIdArray(nodes)
  return nodes.toArray().map(node => toVector(node, canonicalNodeIds))
}

function state (nodes) {
  const perplexity = 30 // effective number of nearest neighbors
  const dim = 2 // by default 2-D tSNE
  const epsilon = 10 // learning rate

  const data = graphToVectors(nodes)

  const [P, N] = initDataRaw(data, perplexity)
  const [Y, gains, ystep] = initSolution(N, dim)

  let iter = 0;

  return {
    nodes,
    data,

    perplexity,
    dim,
    epsilon,

    P,
    N,
    Y,
    gains,
    ystep,

    iter,
  }
}

// helper function
function sign (x) {
  return x > 0 ?
    1 :
    x < 0 ?
      -1 :
      0;
}

// adjustmentFactor linearly scales the position of the nodes to spread them out for visualisation
// minimumCoordinates [minX, minY] translates the positions so they're greater than these values
export function tsne (nodes, adjustmentFactor = 500, minimumCoordinates) {
  const tsneState = state(nodes)

  for (let i = 0; i < 1000; i++) {
    step(tsneState)
  }

  const translateBy = [0, 0]
  if (minimumCoordinates) {
    const minimumValues = [Infinity, Infinity]
    for (const [x, y] of tsneState.Y) {
      minimumValues[0] = Math.min(x, minimumValues[0])
      minimumValues[1] = Math.min(y, minimumValues[1])
    }
    translateBy[0] = minimumCoordinates[0] - minimumValues[0]
    translateBy[1] = minimumCoordinates[1] - minimumValues[1]
  }

  for (let i = 0; i < tsneState.Y.length; i++) {
    const adjustedPositions = adjust(tsneState.Y[i])
    tsneState.Y[i] = adjustedPositions
    const [x, y] = adjustedPositions

    const node = tsneState.nodes.eq(i)
    node.position({ x, y })
  }

  return {
    nodes: tsneState.nodes,
    positions: tsneState.Y,
  }

  function adjust (initialPosition) {
    return [
      initialPosition[0] * adjustmentFactor + translateBy[0],
      initialPosition[1] * adjustmentFactor + translateBy[1],
    ]
  }
}

// perform a single step of optimization to improve the embedding
function step (tsneState) {
  tsneState.iter += 1;
  const N = tsneState.N;

  const { cost, grad } = costGrad(tsneState.Y, tsneState)

  // perform gradient step
  const ymean = zeros(tsneState.dim);
  for (let i = 0; i < N; i++) {
    for (let d = 0; d < tsneState.dim; d++) {
      const gid = grad[i][d];
      const sid = tsneState.ystep[i][d];
      const gainid = tsneState.gains[i][d];

      // compute gain update
      let newgain = sign(gid) === sign(sid)
        ? gainid * 0.8
        : gainid + 0.2;
      if (newgain < 0.01) {
        newgain = 0.01; // clamp
      }
      tsneState.gains[i][d] = newgain; // store for next turn

      // compute momentum step direction
      const momval = tsneState.iter < 250 ? 0.5 : 0.8;
      const newsid = momval * sid - tsneState.epsilon * newgain * grad[i][d];
      tsneState.ystep[i][d] = newsid; // remember the step we took

      // step!
      tsneState.Y[i][d] += newsid;

      ymean[d] += tsneState.Y[i][d]; // accumulate mean so that we can center later
    }
  }

  // reproject Y to be zero mean
  for (let i = 0; i < N; i++) {
    for (let d = 0; d < tsneState.dim; d++) {
      tsneState.Y[i][d] -= ymean[d]/N;
    }
  }

  return cost; // return current cost
}

// return cost and gradient, given an arrangement
function costGrad (Y, tsneState) {
  const N = tsneState.N;
  const dim = tsneState.dim; // dim of output space
  const P = tsneState.P;

  const pmul = tsneState.iter < 100 ? 4 : 1; // trick that helps with local optima

  // compute current Q distribution, unnormalized first
  const Qu = zeros(N * N);
  let qsum = 0.0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let dsum = 0.0;
      for (let d = 0; d < dim; d++) {
        const dhere = Y[i][d] - Y[j][d];
        dsum += dhere * dhere;
      }
      const qu = 1.0 / (1.0 + dsum); // Student t-distribution
      Qu[i*N+j] = qu;
      Qu[j*N+i] = qu;
      qsum += 2 * qu;
    }
  }

  // normalize Q distribution to sum to 1
  const NN = N*N;
  const Q = zeros(NN);
  for (let q = 0; q < NN; q++) {
    Q[q] = Math.max(Qu[q] / qsum, 1e-100);
  }

  let cost = 0.0;
  const grad = [];
  for (let i = 0; i < N; i++) {
    const gsum = new Array(dim); // init grad for point i
    for (let d = 0; d < dim; d++) {
      gsum[d] = 0.0;
    }
    for (let j = 0; j < N; j++) {
      cost += - P[i*N+j] * Math.log(Q[i*N+j]); // accumulate cost (the non-constant portion at least...)
      const premult = 4 * (pmul * P[i*N+j] - Q[i*N+j]) * Qu[i*N+j];
      for (let d = 0; d < dim; d++) {
        gsum[d] += premult * (Y[i][d] - Y[j][d]);
      }
    }
    grad.push(gsum);
  }

  return { cost, grad };
}

function initDataRaw (X, perplexity) {
  const N = X.length;
  const dists = xtod(X); // convert X to distances using gaussian kernel
  const P = d2p(dists, perplexity, 1e-4); // attach to object

  return [P, N]
}

function initSolution(N, dim) {
  // generate random solution to t-SNE
  const Y = randn2d(N, dim); // the solution
  const gains = randn2d(N, dim, 1.0); // step gains to accelerate progress in unchanging directions
  const ystep = randn2d(N, dim, 0.0); // momentum accumulator

  return [Y, gains, ystep]
}

// compute pairwise distance in all vectors in X
function xtod (X) {
  const N = X.length;
  const dist = zeros(N * N); // allocate contiguous array
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = L2(X[i], X[j]);
      dist[i*N+j] = d;
      dist[j*N+i] = d;
    }
  }
  return dist;
}

// compute L2 distance between two vectors
function L2 (x1, x2) {
  const D = x1.length;
  let d = 0;
  for (let i = 0; i < D; i++) {
    const x1i = x1[i];
    const x2i = x2[i];
    d += (x1i-x2i)*(x1i-x2i);
  }
  return d;
}

// utility that returns 2d array filled with random numbers
// or with value s, if provided
function randn2d (n, d, s) {
  const uses = typeof s !== 'undefined';
  const x = [];
  for (let i = 0; i < n; i++) {
    const xhere = [];
    for (let j = 0; j < d; j++) {
      if (uses) {
        xhere.push(s);
      } else {
        xhere.push(randn(0.0, 1e-4));
      }
    }
    x.push(xhere);
  }
  return x;
}

// return 0 mean unit standard deviation random number
const gaussRandom = (() => {
  let return_v = false;
  let v_val = 0.0;

  return function() {
    if (return_v) {
      return_v = false;
      return v_val;
    }
    const u = 2*Math.random()-1;
    const v = 2*Math.random()-1;
    const r = u*u + v*v;
    if(r === 0 || r > 1) {
      return gaussRandom();
    }
    const c = Math.sqrt(-2*Math.log(r)/r);
    v_val = v*c; // cache this for next function call for efficiency
    return_v = true;
    return u*c;
  }
})()

// return random normal number
function randn (mu, std) {
  return mu+gaussRandom()*std;
}

// utilitity that creates contiguous vector of zeros of size n
function zeros (n) {
  if(typeof n === 'undefined' || isNaN(n)) {
    return []
  }

  return new Float64Array(n) // typed arrays are faster
}

// compute (p_{i|j} + p_{j|i})/(2n)
function d2p (D, perplexity, tol) {
  const Nf = Math.sqrt(D.length); // this better be an integer
  const N = Math.floor(Nf);
  assert(N === Nf, "D should have square number of elements.");

  const Htarget = Math.log(perplexity); // target entropy of distribution
  const P = zeros(N * N); // temporary probability matrix

  const prow = zeros(N); // a temporary storage compartment
  for (let i = 0; i < N; i++) {
    let betamin = -Infinity;
    let betamax = Infinity;
    let beta = 1; // initial value of precision
    let done = false;

    const maxtries = 50;

    // perform binary search to find a suitable precision beta
    // so that the entropy of the distribution is appropriate
    let num = 0;
    while (!done) {
      // compute entropy and kernel row with beta precision
      let psum = 0.0;
      for (let j = 0; j <N; j++) {
        let pj = Math.exp(- D[i*N+j] * beta);
        if (i===j) {
          pj = 0; // we dont care about diagonals
        }
        prow[j] = pj;
        psum += pj;
      }

      // normalize p and compute entropy
      let Hhere = 0.0;
      for (let j = 0; j<N; j++) {
        let pj
        if (psum === 0) {
          pj = 0;
        } else {
          pj = prow[j] / psum;
        }

        prow[j] = pj;
        if(pj > 1e-7) {
          Hhere -= pj * Math.log(pj);
        }
      }

      // adjust beta based on result
      if(Hhere > Htarget) {
        // entropy was too high (distribution too diffuse)
        // so we need to increase the precision for more peaky distribution
        betamin = beta; // move up the bounds
        if (betamax === Infinity) {
          beta = beta * 2;
        } else {
          beta = (beta + betamax) / 2;
        }

      } else {
        // converse case. make disruption less peaky
        betamax = beta;
        if (betamin === -Infinity) {
          beta = beta / 2;
        } else {
          beta = (beta + betamin) / 2;
        }
      }

      // stopping conditions: too many tries or got a good precision
      num++;
      done = (
        done ||
        (Math.abs(Hhere - Htarget) < tol) ||
        (num >= maxtries)
      )
    }

    // copy over the final prow to P at row i
    for (let j = 0; j < N; j++) {
      P[i*N+j] = prow[j];
    }

  } // end loop over examples i

  // symmetrize P and normalize it to sum to 1 over all ij
  const Pout = zeros(N * N);
  const N2 = N*2;
  for (let i = 0; i < N;i++) {
    for (let j = 0; j < N;j++) {
      Pout[i*N+j] = Math.max((P[i*N+j] + P[j*N+i])/N2, 1e-100);
    }
  }

  return Pout;
}
