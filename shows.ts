import { readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import querystring from 'node:querystring';
import {
  catchError,
  EMPTY,
  filter,
  from,
  map,
  mergeAll,
  mergeMap,
  of,
  take,
  tap,
  toArray,
} from 'rxjs'

const parentDirectory = process.argv[3]

type ShowSearchResponse = {
  filename: string,
  json: {
    results: {
      first_air_date: string
    }[]
  }
}

console.log(parentDirectory)

from(
  readdir(parentDirectory)
)
.pipe(
  mergeAll(),
  filter((filename) => (
    !(
      /.+ (\(\d{4}\)) .*\[.+/
      .test(filename)
    )
  )),
  // take(1),
  tap(() => console.info('\n')),
  tap(console.info),
  map((filename: string) => {
    const url = `https://api.themoviedb.org/3/search/tv?query=${querystring.escape(filename.replace(/(.+?) .+$/, '$1'))}&include_adult=false&language=en-US&page=1`;

    console.log(url)

    const options = {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.THEMOVIEDB_API_KEY!}`
      }
    };

    return (
      fetch(url, options)
      .then(res => res.json())
      .then((json: ShowSearchResponse['json']) => ({
        filename,
        json,
      }))
      .catch((error) => {
        console.error(error)

        return {
          filename: '',
          json: {
            results: [{
              first_air_date: '',
            }]
          },
        }
      }) satisfies Promise<ShowSearchResponse>
    )
  }),
  mergeAll(5),
  // toArray(),
  filter(({ filename }) => Boolean(filename)),
  map(({
    filename,
    json,
  }) => (
    of(json)
    .pipe(
      map(json => json.results.at(0)),
      catchError((error) => {
        console.error(filename, json, error)
        return EMPTY
      }),
      filter(Boolean),
      map(({ first_air_date }) => new Date(first_air_date).getFullYear()),
      tap((releaseYear) => console.info(releaseYear, filename, json.results.at(0))),
      filter((releaseYear) => !isNaN(releaseYear)),
      // tap(console.info),
      map((releaseYear => filename.replace(/(.+?) /, `$1 (${releaseYear}) `))),
      // tap(console.info),
      map((newFilename) => rename(parentDirectory.concat(path.sep, filename), parentDirectory.concat(path.sep, newFilename))),
      catchError((error) => {
        console.error(error)
        return EMPTY
      }),
    )
  )),
  // toArray(),
  mergeAll(),
  catchError((error) => {
    console.error(error)
    return EMPTY
  }),
)
.subscribe()
