import { readdir, rename } from 'node:fs/promises';
import { extname, sep } from 'node:path';
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

type MovieSearchResponse = {
  filename: string,
  json: {
    results: {
      release_date: string
    }[]
  }
}

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
  // take(1), // Uncomment for debugging a single file.
  tap(() => console.info('\n')),
  tap(console.info),
  map((
    filename,
  ) => {
    const movieName = (
      filename
      .replace(
        (
          extname(
            filename
          )
        ),
        ""
      )
      .replace(
        /^(.+) \[.*$/,
        "$1"
      )
    )

    const url = `https://api.themoviedb.org/3/search/movie?query=${querystring.escape(movieName)}&include_adult=false&language=en-US&page=1`;

    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${process.env.THEMOVIEDB_ACCESS_TOKEN!}`
      }
    };

    return (
      fetch(url, options)
      .then(res => res.json())
      .then((json: MovieSearchResponse["json"]) => ({
        filename,
        json,
      }))
      .catch((error) => {
        console.error(error)

        return {
          filename: '',
          json: {
            results: [{
              release_date: '',
            }]
          },
        }
      }) satisfies Promise<MovieSearchResponse>
    )
  }),
  mergeAll(5),
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
      map(({ release_date }) => new Date(release_date).getFullYear()),
      tap((releaseYear) => console.info(releaseYear, "->", filename)),
      // tap(() => console.info(json.results.at(0))), // Useful for debugging.
      filter((releaseYear) => !isNaN(releaseYear)),
      // tap(console.info),
      map((releaseYear => filename.replace(/(.+) \[/, `$1 (${releaseYear}) [`))),
      tap(console.log),
      // tap(console.info),
      map((newFilename) => rename(parentDirectory.concat(sep, filename), parentDirectory.concat(sep, newFilename))),
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
