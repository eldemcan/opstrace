/**
 * Copyright 2021 Opstrace, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useDispatch } from "state/provider";
import { debounce } from "lodash";

import { editor } from "monaco-editor/esm/vs/editor/editor.api";
import * as yamlParser from "js-yaml";
import { YamlEditor } from "client/components/Editor";

import { useForm, useFormState } from "state/form/hooks";
import { Form } from "state/form/types";
import { useTenant, useAlertmanager } from "state/tenant/hooks";
import { updateAlertmanager } from "state/tenant/actions";

import SideBar from "./Sidebar";

import { AlertmanagerUpdateResponse } from "state/graphql-api-types";

import Layout from "client/layout/MainContent";
import Skeleton from "@material-ui/lab/Skeleton";
import { Box } from "client/components/Box";
import { Card, CardContent, CardHeader } from "client/components/Card";
import { Button } from "client/components/Button";
import { CondRender } from "client/utils/rendering";

import {
  alertmanagerConfigSchema,
  jsonSchema
} from "client/validation/alertmanagerConfig";

type validationCheckOptions = {
  useModelMarkers: boolean;
};

type FormData = {
  remoteValidation: AlertmanagerUpdateResponse;
};

const defaultData: FormData = {
  remoteValidation: {
    success: true
  }
};

const AlertmanagerConfigEditor = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const tenant = useTenant(tenantId);
  const formId = useForm({
    type: "alertmanagerConfig",
    code: tenantId,
    data: defaultData
  });
  const formState = useFormState(formId, defaultData) as Form<FormData>;
  const alertmanager = useAlertmanager(tenantId);
  const configRef = useRef<string>(alertmanager?.config || "");
  const [, setConfigValid] = useState<boolean | null>(null);
  const dispatch = useDispatch();

  const handleConfigChange = useCallback((newConfig, filename) => {
    const validationCheck: (
      _filename: string,
      _options?: validationCheckOptions
    ) => void = (filename, options) => {
      const markers = options?.useModelMarkers
        ? editor.getModelMarkers({
            resource: monaco.Uri.parse(filename)
          })
        : [];

      if (markers.length === 0) {
        try {
          const parsedData = yamlParser.load(configRef.current, {
            schema: yamlParser.JSON_SCHEMA
          });

          alertmanagerConfigSchema
            .validate(parsedData, { strict: true })
            .then((_value: object) => {
              setConfigValid(true);
            })
            .catch((_err: { name: string; errors: string[] }) => {
              setConfigValid(false);
            });
        } catch (e) {
          setConfigValid(false);
        }
      } else {
        setConfigValid(false);
      }
    };

    const validationCheckOnChangeStart = debounce(validationCheck, 300, {
      leading: true,
      trailing: false
    });
    const checkValidationOnChangePause = debounce(validationCheck, 500, {
      maxWait: 5000
    });

    configRef.current = newConfig;
    validationCheckOnChangeStart(filename);
    checkValidationOnChangePause(filename);
  }, []);

  const handleSave = useCallback(() => {
    if (tenant?.name) {
      dispatch(
        updateAlertmanager({
          tenantId: tenant.name,
          header: alertmanager?.header || "",
          config: configRef.current,
          formId: formId
        })
      );
    }
  }, [tenant?.name, alertmanager?.header, formId, dispatch]);

  if (!tenant)
    return (
      <Layout sidebar={SideBar}>
        <Skeleton variant="rect" width="100%" height="100%" animation="wave" />
      </Layout>
    );
  else
    return (
      <Layout sidebar={SideBar}>
        <Box
          width="100%"
          height="100%"
          display="flex"
          justifyContent="center"
          alignItems="center"
          flexWrap="wrap"
          p={1}
        >
          <Box maxWidth={700}>
            <Card p={3}>
              <CardHeader
                titleTypographyProps={{ variant: "h5" }}
                title={`${tenant.name} / Alertmanager Configuration`}
              />
              <CardContent>
                <Box display="flex" height="500px" width="700px">
                  <YamlEditor
                    filename="alertmanager-config.yaml"
                    jsonSchema={jsonSchema}
                    data={alertmanager?.config || ""}
                    onChange={handleConfigChange}
                  />
                </Box>
              </CardContent>
              <Button
                variant="contained"
                state="primary"
                disabled={formState.status !== "active"}
                onClick={handleSave}
              >
                publish
              </Button>
              <ErrorPanel response={formState.data.remoteValidation} />
            </Card>
          </Box>
        </Box>
      </Layout>
    );
};

type ErrorPanelProps = {
  response: AlertmanagerUpdateResponse;
};

const ErrorPanel = ({ response }: ErrorPanelProps) => (
  <CondRender unless={response.success}>
    <CardHeader
      titleTypographyProps={{ variant: "h6" }}
      title="Error: Service side validation failed"
    />

    <CardContent>{response.error_raw_response}</CardContent>
  </CondRender>
);

export default AlertmanagerConfigEditor;
