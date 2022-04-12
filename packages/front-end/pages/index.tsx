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
  Center,
  Container,
  ChakraProvider,
  Divider,
  Flex,
  Heading,
  HStack,
  Input,
  Progress,
  Spacer,
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
export enum SubscriptionStatus {
  Initialising = "init",
  Active = "active",
  Failed = "failed",
}

// FIXME shared with other packages
export enum ProcessStatus {
  Start = "start",
  Success = "success",
  Failure = "failure",
}

export type BucketFile = {
  status: ProcessStatus;
  bucket?: string; /// Storage bucket name
  path?: string; /// Bucket path
  url?: string; /// Short-lived access URL
  reason?: string; /// Failure reason
};

/// Encapsulate an object interface that implements
/// a universally unique identifier for correlation
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
  //             ------

  /// Upload URL
  url?: string;

  // If upload is InProgress
  //             -----------

  /// Upload progress
  progress?: number;

  // If upload is Rejected
  //             ----------

  /// Reason why file was rejected
  reason?: string;

  // If upload is Done
  //             ------

  // Integrations
  ingest?: BucketFile;
  "ingest-pdf"?: BucketFile;
};

export type FileCallback = { (e: FileUpload): void };
export type FileDict = Record<string, File>;

export type PartialFile = UuidLike & Partial<FileUpload>;
type UploadProps = {
  file: FileUpload;
  dispatch: { (e: PartialFile): void };
};

const Upload: React.FC<UploadProps> = (props) => {
  const { file: fileProps, dispatch } = props;
  const { uuid } = fileProps;
  const { _file } = fileProps;
  const [fileRef] = React.useState(_file);
  const [subscription, setSubscription] = React.useState<EventSource | null>(
    null
  );

  /// Called when Upload is initialising,
  /// POST /upload API and generate an upload URL
  ///
  /// Retry using backoff delay on HTTP 5xx
  const submit: { (f: FileUpload, n?: number, e?: Error[]): void } =
    React.useCallback(
      (f, attempt = 1, errors = []) => {
        dispatch({ uuid, status: UploadStatus.Submit });
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
                uuid,
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
                `Upload submit failed after ${MAX_ATTEMPTS} attempts: ${err.message}`,
                { err, errors }
              );
              dispatch({
                uuid,
                status: UploadStatus.SubmitFailed,
                reason: err.message,
              });
            } else {
              const delay = 200 + 2 ** attempt * 200;
              new Promise((res) => setTimeout(res, delay)).then(() => {
                submit(f, ++attempt, [...errors, err]);
              });
            }
          });
      },
      [uuid, dispatch]
    );

  /// Called when Upload is ready,
  /// PUT file using generated upload URL
  const upload: FileCallback = React.useCallback(
    async (f) => {
      dispatch({ uuid, status: UploadStatus.InProgress });
      const { url } = f;
      if (!url) {
        dispatch({ uuid, status: UploadStatus.Failed, reason: "NO_URL" });
        return;
      }
      const config: AxiosRequestConfig = {
        headers: { "Content-Type": `${f.type}` },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          dispatch({ uuid, status: UploadStatus.InProgress, progress });
        },
      };

      return axios
        .put(url, fileRef, config)
        .then(({ status }) => {
          if (status > 400) throw `API response: ${status}`;
          dispatch({ uuid, status: UploadStatus.Done, progress: 101 });
        })
        .catch((err) => {
          console.error(err.message, { err });
          dispatch({ uuid, status: UploadStatus.Failed, reason: "PUT_FAIL" });
        });
    },
    [fileRef, dispatch, uuid]
  );

  /// Called when Upload is Done,
  /// create an EventSource using GET /upload
  const subscribe: { (f: FileUpload, n?: number, e?: Error[]): void } =
    React.useCallback(
      async (f, attempt = 1, errors = []) => {
        const { path } = f;
        if (!path) throw "No file path";

        /// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
        const source = new EventSource(
          `/api/upload?${new URLSearchParams({ path }).toString()}`
        );

        source.onmessage = (e) => {
          const message = JSON.parse(e.data);
          console.log({ message });
          const { kind, ...rest } = message;
          dispatch({ uuid, [kind]: rest });
        };
        source.onerror = (e) => {
          if (attempt < MAX_ATTEMPTS) {
            subscribe(f, ++attempt, [
              /*...errors, e*/
            ]);
          } else {
            source.close();
            console.error("Failed to subscribe", { e, errors });
          }
        };

        setSubscription(source);
      },
      [uuid, dispatch]
    );

  React.useEffect(() => {
    switch (fileProps.status) {
      case UploadStatus.Initialising: {
        submit(fileProps);
        break;
      }

      case UploadStatus.Ready: {
        upload(fileProps);
        break;
      }

      case UploadStatus.Done: {
        if (!subscription) {
          subscribe(fileProps);
        }
        break;
      }

      default:
        break;
    }
  }, [fileProps, submit, upload, subscribe, subscription]);

  return (
    <Box
      as={AccordionItem}
      borderWidth={"thin"}
      borderStyle={"solid"}
      borderRadius="md"
      my={7}
    >
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
          {fileProps.ingest && fileProps.ingest.status === ProcessStatus.Start && (
            <Badge variant="outline" colorScheme="blue">
              Ingest started
            </Badge>
          )}
          {fileProps.ingest &&
            fileProps.ingest.status === ProcessStatus.Success && (
              <Badge variant="subtle" colorScheme="blue">
                Ingested
              </Badge>
            )}
          {fileProps.ingest &&
            fileProps.ingest.status === ProcessStatus.Failure && (
              <Badge variant="solid" colorScheme="red">
                Ingest failed
              </Badge>
            )}
          {fileProps["ingest-pdf"] &&
            fileProps["ingest-pdf"].status === ProcessStatus.Start && (
              <Badge variant="outline" colorScheme="green">
                PDF generating
              </Badge>
            )}
          {fileProps["ingest-pdf"] &&
            fileProps["ingest-pdf"].status === ProcessStatus.Success && (
              <Badge variant="solid" colorScheme="green">
                PDF ready
              </Badge>
            )}
          {fileProps["ingest-pdf"] &&
            fileProps["ingest-pdf"].status === ProcessStatus.Failure && (
              <Badge variant="solid" colorScheme="red">
                PDF fail
              </Badge>
            )}
        </HStack>
      </AccordionButton>

      <Box p={5}>
        <Heading as={"h2"} fontSize={"md"}>
          {fileProps.name}
        </Heading>
        {!fileProps.progress &&
          fileProps.status === UploadStatus.InProgress && (
            <Progress
              mt={3}
              value={fileProps.progress}
              isIndeterminate
              borderRadius={"sm"}
            />
          )}
        {fileProps.progress && fileProps.progress < 101 && (
          <Progress mt={3} value={fileProps.progress} borderRadius={"sm"} />
        )}
      </Box>

      <AccordionPanel>
        <Heading as={"h3"} fontSize={"sm"} mt={3}>
          Upload service
        </Heading>
        <Text>UUID: {fileProps.uuid}</Text>
        <Text textColor={"GrayText"}>
          File upload status: {fileProps.status}
        </Text>
        <Text textColor={"GrayText"}>
          Subscription status: {subscription ? "Active" : "Inactive"}
        </Text>
        {fileProps.progress && (
          <Text textColor={"GrayText"}>Progress: {fileProps.progress}%</Text>
        )}
        {fileProps.reason && (
          <Text textColor={"GrayText"}>Reason: {fileProps.reason}</Text>
        )}

        <Heading as={"h3"} fontSize={"sm"} mt={3}>
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

        <Heading as={"h3"} fontSize={"sm"} mt={3}>
          Integrations
        </Heading>
        <Heading as={"h4"} fontSize={"sm"} mt={2}>
          File ingest
        </Heading>
        {fileProps.ingest ? (
          <>
            <Text>Status: {fileProps.ingest.status}</Text>
            <Text textColor={"GrayText"}>
              Bucket: {fileProps.ingest.bucket}
            </Text>
            <Text textColor={"GrayText"}>Path: {fileProps.ingest.path}</Text>
          </>
        ) : (
          <Text textColor={"GrayText"}>No file ingest data yet</Text>
        )}
        <Heading as={"h4"} fontSize={"sm"} mt={1}>
          PDF generator
        </Heading>
        {fileProps["ingest-pdf"] ? (
          <>
            <Text>Status: {fileProps["ingest-pdf"].status}</Text>
            <Text textColor={"GrayText"}>
              Bucket: {fileProps["ingest-pdf"].bucket}
            </Text>
            <Text textColor={"GrayText"}>
              Path: {fileProps["ingest-pdf"].path}
            </Text>
            {fileProps["ingest-pdf"].url && (
              <a href={fileProps["ingest-pdf"].url}>
                <Button colorScheme={"green"} mt={3} size="sm">
                  Download PDF
                </Button>
              </a>
            )}
          </>
        ) : (
          <Text textColor={"GrayText"}>No PDF generator data available</Text>
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
    // Make sure we have a valid event body
    if (event._clear) return [];
    if (!event.uuid) throw `Missing UUID in event body`;

    // Pull out item if already exists
    state = state.filter((i) => i.uuid !== event.uuid);

    // Push item to state
    state.push(event);
    return state;
  };
  const [state, dispatchState] = React.useReducer(stateReducer, []);

  const dispatch = React.useCallback(
    (e: PartialFile) => {
      const item = state.find((i) => i.uuid === e.uuid);
      return dispatchState({ ...(item as FileUpload), ...e });
    },
    [dispatchState, state]
  );

  const clear = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => dispatchState({ _clear: true } as any),
    [dispatchState]
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
    <ChakraProvider>
      <Container my={10}>
        {/* Demo information */}
        <Heading as={"h1"}>Serverless Storage Demo</Heading>
        <Text>Upload files, run checks and convert to PDF</Text>

        <Divider my={9} />

        {/* New upload picker */}
        <Box
          p={5}
          py={"3rem"}
          borderStyle={isDragActive ? "solid" : "dotted"}
          borderColor={isDragActive ? "#2CB494" : "black"}
          borderWidth={"thin"}
          borderRadius={"3xl"}
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

        <Divider my={9} />

        {/* Existing uploads (if any) */}
        <Flex w="full">
          <HStack>
            <Heading>{state.length}</Heading>
            <Text>upload entries</Text>
          </HStack>
          <Spacer />
          <Button
            onClick={clear}
            float="right"
            variant="outline"
            colorScheme="red"
          >
            Clear all
          </Button>
        </Flex>
        {state.length > 0 && (
          <>
            <Accordion allowToggle allowMultiple>
              {state
                .sort((a, b) => (a.uuid > b.uuid ? -1 : 1))
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
        {state.length < 1 && (
          <>
            <Center>
              <Text p={7}>All clear now!</Text>
            </Center>
          </>
        )}

        <Footer />
      </Container>
    </ChakraProvider>
  );
};

export default Home;
