---
layout: post
title:  "Bulk DynamoDB Item Upload with Terraform"
date:   2020-04-27 18:24:27 -0500
categories: terraform aws dynamodb
---
# Overview

DynamoDB is great!  It can be used for routing and metadata table, be used to lock Terraform State files, track states of applications and much more!  This post will offer a solution for populating multiple items (rows) of data within a DynamoDB table at create-time, entirely within Terraform.  

The issue I am looking to solve here is to provision a DynamoDB lookup table entirely from Terraform, without involving extra steps that Terraform can not invoke, without a ton of extra work, and something that can be easily re-producible and scalable.

The code is available here for those who just want to get to the solution is in the github at the bottom of the post.  I am using version 0.12.24, but anything 0.12+ should work without issue.  In addition, the AWS User/Role to run this configuration also needs to be able to use `dynamodb:CreateTable` and `dynamodb:BatchWriteItem`.

Requirements:
1.  It has to be able to be invoked form Terraform
2.  It has to be able to be committed in Version Control
3.  It has to work on any number of items for DynamoDB
4.  Ideally, no other dependencies should be needed

Knowledge Needed:
- DynamoDB - Items
- Terraform - Basics of Resources and Provisioners

# Current Problem

Provisioning an empty DynamoDB table in Terraform is quite easy, an example Terraform Configuration is below:

{% highlight hcl %}
resource "aws_dynamodb_table" "basic-dynamodb-table" {
  name           = "GameScores"
  billing_mode   = "PROVISIONED"
  read_capacity  = 20
  write_capacity = 20
  hash_key       = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }


  tags = {
    Name        = "dynamodb-table-1"
    Environment = "production"
  }
}
{% endhighlight %}

[Source](https://www.terraform.io/docs/providers/aws/r/dynamodb_table.html)

This resource declaration will result in a blank table, that has to have data loaded later.  HashiCorp does offer a solution for managing DynamoDB Items, as shown below:

{% highlight hcl %}
resource "aws_dynamodb_table_item" "example" {
  table_name = "${aws_dynamodb_table.example.name}"
  hash_key   = "${aws_dynamodb_table.example.hash_key}"

  item = <<ITEM
{
  "exampleHashKey": {"S": "something"},
  "one": {"N": "11111"},
  "two": {"N": "22222"},
  "three": {"N": "33333"},
  "four": {"N": "44444"}
}
ITEM
}
{% endhighlight %}

This works quite well, but is limited to one item per Terraform resource.  That does not scale well, and produces massive Terraform Configuration files.  In fact, the Terraform Documentation itself gives the same warning:

```
Note: This resource is not meant to be used for managing large amounts of data in your table, it is not designed to scale. You should perform regular backups of all data in the table, see AWS docs for more.
```

This is clearly not an optimal solution, so what can be done?  Let's see what AWS has to offer, since DynamoDB is an AWS Product.  Scanning through the documentation reveals two possible methods, `PutItem` and `BatchWriteItem`.

# `PutItem` vs `BatchWriteItem`

DynamoDB offers a few methods for writing data to tables, `PutItem` and `BatchWriteItem`.  Some key details of each is below:

## `PutItem`
- Is used to upload a single item
- Can determine if the field exists before uploading

PutItem looks like what the `dynamodb_table_item` resource is using in the previous section.  An example is below:

{% highlight shell %}
aws dynamodb put-item \
    --table-name MusicCollection \
    --item '{"Artist": {"S": "Obscure Indie Band"}}' \
    --condition-expression "attribute_not_exists(Artist)"
{% endhighlight %}


[Source](https://docs.aws.amazon.com/cli/latest/reference/dynamodb/put-item.html)

This will add the item above to the MusicCollection table, on the condition the artist does not already exist.  It could be possible to use a loop and define some standard to store multiple items, iterate over each item, and add it to the table; but that seems like a lot of work.  Let's check out alterantives.

## `BatchWriteItem`
- Can upload many items to a table at once
- Will simply overwrite all items that have matching Primary Keys

[Source](https://docs.aws.amazon.com/cli/latest/reference/dynamodb/batch-write-item.html)

An example is below:

{% highlight shell %}
aws dynamodb batch-write-item \
    --request-items file://request-items.json
{% endhighlight %}

Here is a snippet of `request-items.json`
{% highlight json %}
{
    "MusicCollection": [
        {
            "PutRequest": {
                "Item": {
                    "Artist": {"S": "No One You Know"},
                    "SongTitle": {"S": "Call Me Today"},
                    "AlbumTitle": {"S": "Somewhat Famous"}
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "Artist": {"S": "Acme Band"},
                    "SongTitle": {"S": "Happy Day"},
                    "AlbumTitle": {"S": "Songs About Life"}
                }
            }
        },
        ...
{% endhighlight %}

(Notice, the table to upload the items to is in the JSON itself). 

The JSON example could be any number of items, it can be contorlled in a version control system, and the documentation gives the following warning about updating items:

```
BatchWriteItem cannot update items. To update items, use the UpdateItem action.
```

That is not an issue for this case as all data will live inside of one JSON file in Version Control.

It looks as we have a working solution, as `BatchWriteItem` will load as many items into a table as we like, will be able to do everything at once, and we can centralize data management of the table through a JSON file.

Now, how can we get this to be invoked solely from Terraform?

# Terraform Provisioners

A provisioner in Terraform allows for the execution of a file into either the local machine running Terraform for the machine Terraform just provisioned. Provisioners can configure infrastructure, typically virtual machines, either on the local node (that is running Terraform) or the remote machine (that Terraform created).  In this case, we will use `local-exec`, which will allow running a file on the machine that Terraform is running on.  For more information, check out the [docs](https://www.terraform.io/docs/provisioners/index.html) on Provisioners.  

# `Local-Exec` Provisioner

An example of `local-exec`, with EC2 in this case, is below:

{% highlight hcl %}
resource "aws_instance" "web" {
  # ...

  provisioner "local-exec" {
    command = "echo The server's IP address is ${self.private_ip}"
  }
}
{% endhighlight %}

The example above is for EC2; However, `local-exec` can run for any AWS resource, including DynamoDB!

# Solution

Alright, so we now have the following:
- A Terraform Configuration to Build a DynamoDB Table
- A Method for uploading multiple items to said table
- A Solution for executing the dataload from Terraform

The only thing left now is to put everything together!

I will provision a very simple DynamoDB table, with 1 unit of Read and Write capacity, no encryption, no streams, and no Autoscaling.  Within the DynamoDB resource, I invoke the `local-exec` provisioner to kick off a Shell script on the same machine that is running Terraform (which also has the AWSCLI installed), this will run `BatchWriteItem` for the table I just created and load all of the sample data.

Here is the Terraform configuration:

{% highlight hcl %}
provider "aws" {
  region  = "us-east-2"
}

resource "aws_dynamodb_table" "basic-dynamodb-table" {
  name           = "ExternallyManagedTable"
  billing_mode   = "PROVISIONED"
  read_capacity  = 1
  write_capacity = 1
  hash_key       = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }

  provisioner "local-exec" {
    command = "bash populate_db.sh"
  }
}
{% endhighlight %}

I have instructed Terraform to use the `aws` provider to build a `dynamodb` resource, then use the `local-exec` provisioner to invoke the shell script below:

{% highlight shell %}
#!/usr/bin/env bash

aws dynamodb batch-write-item --request-items file://items.json
{% endhighlight %}

The shell script references the following JSON:

{% highlight json %}
{
    "ExternallyManagedTable": [
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "A"
                    },
                    "Title": {
                        "S": "Principal Engineer"
                    }
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "E"
                    },
                    "Title": {
                        "S": "Senior Engineer"
                    }
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "I"
                    },
                    "Title": {
                        "S": "Mid Level Engineer"
                    }
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "O"
                    },
                    "Title": {
                        "S": "Lead Engineer"
                    }
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "U"
                    },
                    "Title": {
                        "S": "Associate Engineer"
                    }
                }
            }
        },
        {
            "PutRequest": {
                "Item": {
                    "UserId": {
                        "S": "Y"
                    },
                    "Title": {
                        "S": "Half-Present Intern"
                    }
                }
            }
        }
    ]
}
{% endhighlight %}

This will construct our table, which is a simple metadata lookup table for a headless engineering team comprised entirely of vowels!

To begin, let's Initialize the Terraform configuration:

{% highlight shell %}
terraform init

Initializing the backend...

Initializing provider plugins...

The following providers do not have any version constraints in configuration,
so the latest version was installed.

To prevent automatic upgrades to new major versions that may contain breaking
changes, it is recommended to add version = "..." constraints to the
corresponding provider blocks in configuration, with the constraint strings
suggested below.

* provider.aws: version = "~> 2.59"

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
{% endhighlight %}

On to the plan stage:

{% highlight shell %}
terraform plan
Refreshing Terraform state in-memory prior to plan...
The refreshed state will be used to calculate this plan, but will not be
persisted to local or remote state storage.


------------------------------------------------------------------------

An execution plan has been generated and is shown below.
Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_dynamodb_table.basic-dynamodb-table will be created
  + resource "aws_dynamodb_table" "basic-dynamodb-table" {
      + arn              = (known after apply)
      + billing_mode     = "PROVISIONED"
      + hash_key         = "UserId"
      + id               = (known after apply)
      + name             = "ExternallyManagedTable"
      + read_capacity    = 1
      + stream_arn       = (known after apply)
      + stream_label     = (known after apply)
      + stream_view_type = (known after apply)
      + write_capacity   = 1

      + attribute {
          + name = "UserId"
          + type = "S"
        }

      + point_in_time_recovery {
          + enabled = (known after apply)
        }

      + server_side_encryption {
          + enabled     = (known after apply)
          + kms_key_arn = (known after apply)
        }
    }

Plan: 1 to add, 0 to change, 0 to destroy.

------------------------------------------------------------------------

Note: You didn't specify an "-out" parameter to save this plan, so Terraform
can't guarantee that exactly these actions will be performed if
"terraform apply" is subsequently run.
{% endhighlight %}

Finally, time to Apply our configuration and create the table!

{% highlight shell %}
terraform apply -auto-approve
aws_dynamodb_table.basic-dynamodb-table: Creating...
aws_dynamodb_table.basic-dynamodb-table: Provisioning with 'local-exec'...
aws_dynamodb_table.basic-dynamodb-table (local-exec): Executing: ["/bin/sh" "-c" "bash populate_db.sh"]
aws_dynamodb_table.basic-dynamodb-table (local-exec): {
aws_dynamodb_table.basic-dynamodb-table (local-exec):     "UnprocessedItems": {}
aws_dynamodb_table.basic-dynamodb-table (local-exec): }
aws_dynamodb_table.basic-dynamodb-table: Creation complete after 7s [id=ExternallyManagedTable]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
{% endhighlight %}

If you go to the console, or scan the table, you will see all data is present!

{% highlight shell %}
aws dynamodb scan --table-name ExternallyManagedTable
{% endhighlight %}

The result should be something like below:

{% highlight shell %}
{
    "Items": [
        {
            "Title": {
                "S": "Mid Level Engineer"
            },
            "UserId": {
                "S": "I"
            }
        },
        {
            "Title": {
                "S": "Principal Engineer"
            },
            "UserId": {
                "S": "A"
...
{% endhighlight %}

For those new to DynamoDB, the `S` is the datatype, String in this case.  

If you have any questions, comments, concerns, or requests as to what Cloud/DevOps/Automation/SRE topics you would me to cover next (I am working out a master list of future posts and will announce it later); thanks again for reading and hopefully this helps improve Terraform/DynamoDB workflows!

[Github Repo](https://github.com/jacob-hudson/terraform-bulk-upload)
