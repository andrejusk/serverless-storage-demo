import React from "react";

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Input,
  Text,
} from "@chakra-ui/react";
import { useDropzone } from "react-dropzone";
import { v4 as uuid } from "uuid";
import axios, { AxiosRequestConfig } from "axios";

import Footer from "../components/Footer";

const MAX_ATTEMPTS = 5;

export enum UploadStatus {
  Initialising = "init",
  Submit = "submit",
  SubmitFailed = "submit_failed",
  Ready = "ready",
  InProgress = "uploading",
  Failed = "failed",
  Rejected = "rejected",
  Done = "done",
}

export type UuidLike = {
  uuid: string; /// Unique identifier
};
export type FileUpload = UuidLike & {
  _file: File; /// Original file reference

  name: string; /// Original filename
  size: number; /// Bytes
  lastModified: number; /// Unix seconds
  type: string; /// IANA media type

  bucket?: string; /// Storage bucket file is saved in
  path?: string; /// Path to file
  gsUrl?: string; /// Google Storage URL
  consoleUrl?: string; /// Cloud Console URL

  status: UploadStatus; /// Upload status

  // If upload is Ready
  url?: string; /// Upload URL

  // If upload is InProgress
  progress?: number; /// Upload progress

  // If upload is Rejected
  reason?: string; /// Reason why file was rejected
};

export type FileCallback = { (e: FileUpload): void };
export type FileDict = Record<string, File>;

type UploadProps = {
  file: FileUpload;
  dispatch: FileCallback;
};

const Upload: React.FC<UploadProps> = (props) => {
  const { file: fileProps, dispatch } = props;
  const { _file } = fileProps;
  const [fileRef] = React.useState(_file);

  const submit: { (f: FileUpload, n?: number, e?: Error[]): void } =
    React.useCallback(
      (f, attempt = 1, errors = []) => {
        dispatch({ ...f, status: UploadStatus.Submit });
        const config: AxiosRequestConfig = {
          validateStatus: () => {
            return true;
          },
        };
        return axios
          .post("/api/upload", f, config)
          .then((res) => {
            const { status, data } = res;
            if (status >= 500) {
              throw `API response: ${status}`;
            } else if (status >= 400) {
              const { reason } = data;
              return dispatch({
                ...f,
                status: UploadStatus.SubmitFailed,
                reason,
              });
            }
            const fileResponse = data as FileUpload;
            dispatch({ ...fileResponse, status: UploadStatus.Ready });
          })
          .catch((err) => {
            console.warn(`Caught "${err.message}" on attempt #${attempt}`);
            if (attempt >= MAX_ATTEMPTS) {
              console.error(
                `Failed after ${MAX_ATTEMPTS} attempts: ${err.message}`,
                { err, errors }
              );
              dispatch({
                ...f,
                status: UploadStatus.SubmitFailed,
                reason: err.message,
              });
            } else {
              submit(f, ++attempt, [...errors, err]);
            }
          });
      },
      [dispatch]
    );

  const upload: FileCallback = React.useCallback(
    async (f) => {
      dispatch({ ...f, status: UploadStatus.InProgress, progress: 0 });
      const { url } = f;
      if (!url) {
        dispatch({ ...f, status: UploadStatus.Failed, reason: "NO_URL" });
        return;
      }
      const config: AxiosRequestConfig = {
        headers: { "Content-Type": `${f.type}` },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          dispatch({ ...f, status: UploadStatus.InProgress, progress });
        },
      };

      return axios
        .put(url, fileRef, config)
        .then(({ status }) => {
          if (status > 400) throw `API response: ${status}`;
          dispatch({ ...f, status: UploadStatus.Done, progress: 101 });
        })
        .catch((err) => {
          console.error(err.message, { err });
          dispatch({ ...f, status: UploadStatus.Failed, reason: "PUT_FAIL" });
        });
    },
    [fileRef, dispatch]
  );

  React.useEffect(() => {
    switch (fileProps.status) {
      case UploadStatus.Initialising:
        submit(fileProps);
        break;

      case UploadStatus.Ready:
        upload(fileProps);
        break;

      default:
        break;
    }
  }, [fileProps, submit, upload]);

  return (
    <Box as={AccordionItem} borderWidth={"thin"} borderStyle={"solid"} my={7}>
      <AccordionButton>
        <HStack>
          <AccordionIcon />
          {fileProps.status === UploadStatus.Initialising && (
            <Badge variant="outline">Initialising</Badge>
          )}
          {fileProps.status === UploadStatus.Submit && (
            <Badge variant="subtle">Submitting</Badge>
          )}
          {fileProps.status === UploadStatus.SubmitFailed && (
            <Badge variant="solid" colorScheme="red">
              Submit failed
            </Badge>
          )}
          {fileProps.status === UploadStatus.Ready && (
            <Badge variant="subtle" colorScheme="blue">
              Initialising
            </Badge>
          )}
          {fileProps.status === UploadStatus.InProgress && (
            <Badge variant="subtle" colorScheme="blue">
              Uploading {fileProps.progress || 0}%
            </Badge>
          )}
          {fileProps.status === UploadStatus.Failed && (
            <Badge variant="solid" colorScheme="red">
              Failed
            </Badge>
          )}
          {fileProps.status === UploadStatus.Rejected && (
            <Badge variant="solid" colorScheme="red">
              Rejected
            </Badge>
          )}
          {fileProps.status === UploadStatus.Done && (
            <Badge variant="solid" colorScheme="blue">
              Uploaded
            </Badge>
          )}
        </HStack>
      </AccordionButton>

      <Box p={5}>
        <Heading as={"h2"} fontSize={"md"}>
          {fileProps.name}
        </Heading>
      </Box>

      <AccordionPanel>
        <Heading as={"h3"} fontSize={"sm"}>
          Upload
        </Heading>
        <Text>UUID: {fileProps.uuid}</Text>
        <Text textColor={"GrayText"}>Status: {fileProps.status}</Text>
        {fileProps.progress && (
          <Text textColor={"GrayText"}>Progress: {fileProps.progress}%</Text>
        )}
        {fileProps.reason && (
          <Text textColor={"GrayText"}>Reason: {fileProps.reason}</Text>
        )}

        <Heading as={"h3"} fontSize={"sm"}>
          File
        </Heading>
        <Text>Name: {fileProps.name}</Text>
        <Text>Type: {fileProps.type}</Text>
        <Text>Size: {fileProps.size} bytes</Text>
        {fileProps.bucket && (
          <Text textColor={"GrayText"}>Bucket: {fileProps.bucket}</Text>
        )}
        {fileProps.path && (
          <Text textColor={"GrayText"}>Path: {fileProps.path}</Text>
        )}
        {fileProps.gsUrl && fileProps.consoleUrl && (
          <a href={fileProps.consoleUrl}>
            <Text>{fileProps.gsUrl}</Text>
          </a>
        )}
      </AccordionPanel>
    </Box>
  );
};

/**
 * Application index page
 *
 * Present upload interface to the user,
 * handle file ingest and display ingest status
 */
const Home: React.FC = () => {
  // Application state reducer
  type ReducerProps = FileUpload & {
    _clear?: true; /// If set to true, will clear state
  };
  const stateReducer = (
    state: FileUpload[],
    event: ReducerProps
  ): FileUpload[] => {
    if (event._clear) return [];
    // Remove item if already exists
    state = state.filter((item) => item.uuid !== event.uuid);
    // Push item to state
    state.push(event);
    return state;
  };
  const [state, dispatch] = React.useReducer(stateReducer, []);
  const clear = React.useCallback(
    () => dispatch({ _clear: true } as any),
    [dispatch]
  );

  // Add files to state using drop zone
  const onDrop: { (f: File[]): void } = React.useCallback(
    (files) =>
      files.forEach((file) => {
        const uid = uuid();

        const { name, size, lastModified, type } = file;
        dispatch({
          status: UploadStatus.Initialising,
          uuid: uid,
          name,
          size,
          lastModified,
          type,
          _file: file,
        });
      }),
    [dispatch]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <Container my={21}>
      {/* Demo information */}
      <Heading as={"h1"}>Serverless Storage Demo</Heading>
      <Text>Upload files, run checks and convert to PDF</Text>

      {/* New upload picker */}
      <Box
        p={5}
        py={"3rem"}
        borderStyle={isDragActive ? "groove" : "dashed"}
        borderWidth={"thick"}
        my={7}
        {...getRootProps()}
      >
        {/* Allow mutliple files to be selected */}
        {isDragActive ? (
          <Text>Release to upload files!</Text>
        ) : (
          <Text>Drag & drop file(s) here, or tap to select</Text>
        )}
        <Input
          type="file"
          id="file-input"
          multiple
          p={1}
          my={3}
          {...getInputProps()}
          size={"lg"}
        />
      </Box>

      {/* Existing uploads (if any) */}
      {state.length > 0 && (
        <>
          <Button onClick={clear}>Clear</Button>
          <Text>{state.length} stored upload entries</Text>
          <Accordion allowToggle allowMultiple>
            {state
              .sort((a, b) => a.uuid > b.uuid ? -1 : 1)
              .map((f) => (
                <Upload
                  key={f.uuid}
                  file={f}
                  dispatch={dispatch}
                  // onComplete={({ uuid }) => dispatchFile([uuid, null, true]))}
                />
              ))}
          </Accordion>
        </>
      )}

      <Footer />
    </Container>
  );
};

export default Home;
